var servers = new Object();

function Channel(name) {
    this.name = name;
    this.users = new Object();
}

function Server(hostname, port, ssl, nick) {
    this.hostname = hostname;
    this.enabled = true;
    this.port = port;
    this.ssl = ssl;
    this.nick = nick;
    this.channels = new Object();
}

// Decide the websocket url at load
var ws_protocol = 'ws';
if (window.location.protocol == 'https:') {
    ws_protocol = 'wss';
}
if (window.location.port) {
    var ws_url = ws_protocol+'://'+window.location.hostname+':'+window.location.port+window.location.pathname+'../api/websocket';
}
else {
    var ws_url = ws_protocol+'://'+window.location.hostname+window.location.pathname+'../api/websocket';
}
var socket = null;

function tabCompletion(hostname, channel, input) {
    if (input.selectionStart == input.selectionEnd == input.value.length) {
	$.each(servers[hostname].channels[channel].users, function () {
	});
    }
}

// hashCode and intToARGB borrowed from http://stackoverflow.com/a/3426956
function hashCode(str) { // java String#hashCode
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
	hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hash;
} 

function zeroPad(num,count) {
    var numZeropad = num + '';
    while(numZeropad.length < count) {
	numZeropad = "0" + numZeropad;
    }
    return numZeropad;
}

// Colored nicks
function intToDark(i) {
    r = (i >> 24) & 0xff;
    g = (i >> 16) & 0xff;
    b = (i >> 8) & 0xff;
    if ((r*299 + g*587 + b*114) / 1000 < 140) {
	return zeroPad(r.toString(16), 2) + zeroPad(g.toString(16), 2) + zeroPad(b.toString(16), 2);
    }
    else {
	return intToDark(i * 42);
    }
}

function scrollBottom(target, speed) {
    target.animate({scrollTop: target.prop('scrollHeight')}, speed);
}

// Wraped around any id string with possible special characters
function eid(myid) { 
    return '#' + myid.replace(/([#:|.])/g, '\\$1');
}

function setSessions(val) {
    if (navigator.id) {
	navigator.id.sessions = val ? val : [ ];
    }
}

function loggedIn(email) {
    setSessions([ { email: email } ]);
    $('#new-server').modal('hide');
    $('#logout').bind('click', logout);
    $('#new-server').submit(addServer);
    updateServers().pipe(listServers).done(function () {	
	startPoll(false);
    });
    $('#usermenu .dropdown-toggle').html(email + '<b class="caret" />');
    $('.dropdown-toggle').dropdown();
    $('.logged-out').hide();
    $('.logged-in').show();
    $('#servers').touchwipe({
	wipeLeft: function () { 
	    slideTo($('.stage-left'), "irc-freenode-org");
	    alert("left");
	},
	wipeRight: function () {
	    alert("right");
	},
	preventDefaultEvents: true
    });
}

function loggedOut() {
    setSessions();
    $('#browserid').css('opacity', '1.0');
    $('.logged-in').hide();
    $('.logged-out').show();
}

function logout(event) {
    event.preventDefault();
    $.ajax({
	type: 'POST',
	url: '../api/logout',
	success: function() {
	    // and then redraw the UI.
	    loggedOut();
	}
    });
}

function hostnameId(hostname) {
    return hostname.replace(/\./g,'-');
}

function serverControls(hostname) {
    hostname_id = hostnameId(hostname);
    modal_id = hostname_id + '-channel-join';
    home_id = hostname_id + '-home';
    modal_url = '../api/networks/'+hostname;
    return '<div class="subnav stage-left panel"><ul class="nav nav-list channels-nav"><li><a class="btn-primary" data-toggle="modal" href="#'+modal_id+'"><i class="icon-plus icon-white"/></a></li></ul></div><div id="'+home_id+'" class="tab-content panel"></div><div id="'+modal_id+'" class="modal fade hide"><div class="modal-header">Open a tab!<a class="close" data-dismiss="modal"><i class="icon-remove" /></a></div><div class="modal-body"><form class="form-inline"><input type="text" class="input channel-name" placeholder="Channel or User" /> <input type="text" class="input channel-key" placeholder="Key" /></form></div><div class="modal-footer"><a href="'+modal_url+'" class="btn btn-primary">Open</a></div></div>';
}

function handleEvent(event) {
    $.each([JSON.parse(event.data)], function(index, msg) {
	var source = msg["args"][0].split('!')[0];
	var target = msg["args"][1];
	// These two require client knowledge of who is in which channel
	if (msg["kind"] == "userQuit" || msg["kind"] == "userRenamed") {
	    $.each(servers[hostname].channels, function (n, channel) {
		if (msg["kind"] == "userRenamed" && servers[hostname].channels[channel].users[source]) {
		    servers[hostname].channels[channel].users.push(target);
		}
		delete servers[hostname].channels[channel].users[source];
		var lines = [[msg["event_id"], nick, msg["args"][2], msg["kind"], msg["timestamp"]]];
		newChannelMessages(lines, msg["network"], source, true);
	    });
	}
	else {
	    var nick = source;
	    var channel = target;
	    var lines = [[msg["event_id"], nick, msg["args"][2], msg["kind"], msg["timestamp"]]];
	    
	    if (channel == msg["identity"]) {
		// Talking to ourselves... private messages
		addChannelTab(msg["network"], nick);
		newChannelMessages(lines, msg["network"], nick, true);
	    }
	    else {
		addChannelTab(msg["network"], channel);
		newChannelMessages(lines, msg["network"], channel, true);
	    }
	}
    });
}

function scrolled(event) {
    // Near the top, probably within one line of text
    if ($(window).scrollTop() <= 10) {	
	// Load more scrollback
	active_server = $("#servers .active");
	hostname = $("#servers-nav .active a").text();
	channel = active_server.find('.subnav .channels-nav .active a').text();
	before = active_server.find('.tab-content .active .irc-body tr:first').attr('event-id');
	updateChannel(hostname, channel, {'before': before});
	// 500 is a placeholder for calculating the added content length
	$('html, body').scrollTop(500);
    }
}

// Poll for events
function startPoll(sync) {
    socket = new WebSocket(ws_url);
    console.log("WebSocket connecting to: " + ws_url);
    socket.onopen = function () {
	console.log("WebSocket connected.");
	socket.send(document.cookie);
	if (sync) {
	    console.log("WebSocket reconnecting.");
	    socket.send("sync");
	}
    };
    socket.onmessage = handleEvent;
    socket.onclose = function () {
	console.log("WebSocket closed.");
	startPoll(true);
    };
    socket.onerror = function () {
	console.log("WebSocket error.");
	startPoll(true);
    };
    // Now that we're listening for events, watch for scroll events too
    $(window).scroll(scrolled);
}

function channelURL(prefix, channel) {
    return prefix + '/' + encodeURIComponent(channel);
}

function channelMessagesURL(hostname, channel, channel_options) {
    var url = channelURL('../api/networks/'+hostname, channel)+'/messages';
    if (channel_options) {
	url = url + '?';
	for (var key in channel_options) {
	    url = url + key + '=' + channel_options[key];
	}
    }
    return url;
}

function channelUsersURL(hostname, channel) {
    return channelURL('../api/networks/'+hostname, channel)+'/users';
}

function channelInput(event) {
    event.preventDefault();
    var msg_body = $(event.data.id).val();
    var msg_kind = 'msg';
    if (msg_body.substring(0, 4) === '/me ') {
	msg_body = msg_body.substring(4);
	msg_kind = 'action';
    }
    $.ajax({
	type: 'POST',
	url: event.data.url,
	data: JSON.stringify({"privmsg":msg_body,
			      "kind":msg_kind}),
	dataType: 'json',
	contentType: 'application/json',
	success: function () {
	    $(event.data.id).val("");
	}
    });
}

function switchChannelTab(event) {
    scrollBottom(event.data.host_view, 0);
}

function channelID(hostname_id, channel) {
    return hostname_id + '-' + String(channel).replace('/', '-slash-');
}

function displayUserList(hostname, channel) {
    var list_items = [];
    $.each(servers[hostname].channels[channel].users, function (i, item) {
	list_items.push('<li>'+item+'</li>');
    });
    var ul = $(document.createElement('ul'));
    ul.append(list_items.join(''));
    return ul;
}

function refreshUserList(hostname, channel) {
    return $.getJSON(channelUsersURL(hostname, channel), function (users) {
	var hostname_id = hostnameId(hostname);
	var channel_id = channelID(hostname_id, channel);
	channel_tab = $(eid(channel_id));
	user_ul = channel_tab.children('.users-nav');
	user_ul.empty();
	console.log(user_ul);
	servers[hostname].channels[channel].users = users;
	$.each(users, function (n, user) {
	    user_li = $(document.createElement('li'))
	    user_li.text(user);
	    user_ul.append(user_li);
	});	
    });
}

function addChannelTab(hostname, channel) {
    var hostname_id = hostnameId(hostname);
    var channel_id = channelID(hostname_id, channel);

    // If we're just getting a message from somewhere new, add the pills
    if (!$(eid(channel_id)).length) {
	// Options passed with the form submit for channel input
	var options = {url:channelMessagesURL(hostname, channel),
		       id:eid(channel_id)+'-input'};

	link = $(document.createElement('a'));
	link.attr('href', '#'+channel_id);
	link.attr('data-target', '#'+channel_id.replace(/([#:|.])/g, '\\$1'));
	link.attr('data-toggle', 'tab');
	link.text(String(channel));
	link.bind('shown',
		  {'host_view':$('#'+hostname_id+'-home')},
		  switchChannelTab);
	li = $(document.createElement('li'));
	li.append(link);
	$('#'+hostname_id).find('.channels-nav').append(li);
	
	server_children = $('#'+hostname_id).children('.tab-content');
	server_children.append('<div id="'+channel_id+'" class="tab-pane active"><table class="irc-body"></table></div>');

	user_ul = $(document.createElement('ul'));
	user_ul.addClass('users-nav');
	user_ul.addClass('stage-right');
	user_ul.addClass('panel');

	channel_tab = $(eid(channel_id));
	channel_tab.append(user_ul);
	channel_tab.append('<form><input class="channel-input" id="'+channel_id+'-input" name="'+channel+'" size="16" type="text" /></form>');
	channel_tab.children('form').submit(options, channelInput);
    }
}

function expandImage(event) {
    if ($(this).hasClass('active')) {
	$(this).next().remove();
    }
    else {
	image = $(document.createElement('img'));
	image.attr('src', $(this).prev().attr('href'));
	$(this).after(image);
    }
    $(this).button('toggle');
}

function newChannelMessages(channel_messages, hostname, channel, append) {
    var hostname_id = hostnameId(hostname);
    var channel_id = channelID(hostname_id, channel);
    var irc_body = $(eid(channel_id)+' table.irc-body');

    host_view = $('#' + hostname_id + '-home')
    host_view_height = host_view.prop('scrollHeight');
    if (host_view_height && (host_view.scrollTop() + host_view.height() == host_view_height)) {
	scrolled_down = true;
    }
    else {
	scrolled_down = false;
    }

    // Stick new message rows in the div
    $.each(channel_messages, function(index, val) {
	row = $(document.createElement('tr'));
	row.attr('event-id', val[0]);
	timestamp_col = $(document.createElement('td'));
	timestamp_col.addClass('timestamp');
	timestamp_col.text(String(val[4]).split('-')[1]);
	nick_col = $(document.createElement('td'));
	msg_col = $(document.createElement('td'));
	nick_col.addClass('nick');
	msg_col.addClass('privmsg');
	var url_exp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
	if (val[2]) {
	    msg_col.text(String(val[2]));
	    msg_col.html(msg_col.html().replace(url_exp, '<a href="$1">$1</a>'));
	}
	button = $(document.createElement('button'));
	button.button();
	button.append('<span class="caret"></span>');
	button.addClass('btn');
	button.addClass('btn-info');
	button.addClass('btn-mini');
	button.click(expandImage);
	msg_col.children('a[href*="jpg"], a[href*="png"]').after(button);
	nick_text = String(val[1]);
	nick_color = "#"+intToDark(hashCode(nick_text));
	row.css("color", nick_color);
	nick_col.text(nick_text);
	row.addClass(val[3]);
	row.append(timestamp_col);
	row.append(nick_col);
	row.append(msg_col);
	if (append) {
	    irc_body.append(row);
	}
	else
	{
	    irc_body.prepend(row);
	}
    });

    // Scroll if new lines in the current channel and scrolled down
    if ($(eid(channel_id)).hasClass("active") && scrolled_down) {
	scrollBottom(host_view, 800);
    }
}

function updateChannel(hostname, channel, options) {
    return $.getJSON(channelMessagesURL(hostname, channel, options), function (msgs) {
	newChannelMessages(msgs, hostname, channel);
    });
}

function refreshChannel(hostname, channel) {
    return $.when(refreshUserList(hostname, channel),
		  updateChannel(hostname, channel));
}

function joinChannel(event) {
    event.preventDefault();
    var form = $(this).parent().parent()
	.children(".modal-body")
	.children(".form-inline");
    var channel_name = form.children(".channel-name").val();
    var channel_key = form.children(".channel-key").val();
    var url = $(this).attr('href');
    if (channel_name.charAt(0) == '#' || channel_name.charAt(0) == '&') {
	$.ajax({
	    type: 'POST',
	    url: channelURL(url, channel_name),
	    data: JSON.stringify({"key":channel_key}),
	    dataType: 'json',
	    contentType: 'application/json',
	    success: function () {
		console.log("Joining "+channel_name+" with key "+channel_key);
		$(".modal").modal('hide');
	    }
	});
    }
    else {
	// Private message window
	addChannelTab(String(url.split('/').slice(-1)), channel_name);
	$(".modal").modal('hide');
    }
}

function updateChannels(hostname) {
    var url = '../api/networks/'+hostname;
    var deferred = $.getJSON(url, function (channel_list) {
	return $.map(channel_list, function(val) {
	    servers[hostname].channels[val[0]] = new Channel(val[0]);
	    addChannelTab(hostname, val[0]);
	    return refreshChannel(hostname, val);
	});
    });
    return deferred;
}

function listChannels(hostname) {
    var hostname_id = hostnameId(hostname);
    $('#'+hostname_id).append(serverControls(hostname));
    $('#'+hostname_id+'-channel-join .modal-footer a').click(joinChannel);
    $('#'+hostname_id+' .modal').modal('hide');
    return updateChannels(hostname);
}

function switchServerTab() {
    var hostname_id = '#'+this.href.split('#')[1];
    $('#servers-nav .active').removeClass('active');
    $(this).parent().addClass('active');
    $('#servers .active').removeClass('active');
    $('#servers').find(hostname_id).addClass('active');
}

function addServerTab(hostname) {
    var hostname_id = hostnameId(hostname);
    $('#servers-nav').append('<li><a href="#'+hostname_id+'">'+hostname+'</a></li>');
    $('#servers-nav a').click(switchServerTab);
    $('#servers').append('<div class="tab-pane content" id="'+hostname_id+'"></div>');
}

function updateServers() {
    // Update client side state for servers
    return $.getJSON('../api/networks', function (server_list) {
	$.map(server_list, function (server) {
	    // Overwrites everything, should probably try to sync this
	    server_obj = new Server(server[1], server[2], server[3], server[4]);
	    servers[server_obj.hostname] = server_obj;
	});
    });
}

function listServers() {
    $("#server-list tbody tr").remove();
    return $.map(servers, function(server) {
	var cols = new Array();
	// Enabled server
	if (server.enabled) {
	    cols[0] = '<td><input type="checkbox" class="server-disable" checked /></td>';
	}
	else {
	    cols[0] = '<td><input type="checkbox" class="server-enable" /></td>';
	}
	cols[1] = '<td>'+server.hostname+'</td>';
	cols[2] = '<td>'+server.port+'</td>';
	// SSL configuration
	if (server.ssl) {
	    // Remove disabled when this is implemented
	    cols[3] = '<td><a class="btn btn-small btn-success disabled"><i class="icon-lock icon-white" /> Enabled</a></td>';
	}
	else {
	    cols[3] = '<td><a class="btn btn-small btn-danger disabled"><i class="icon-ban-circle icon-white" /> Disabled</a></td>';
	}
	// Nick configured yet?
	if (server.nick) {
	    cols[4] = '<td><input type="text" class="disabled" value="'+server.nick+'" /></td>';
	}
	else {
	    cols[4] = '<td><input type="text" class="disabled" /></td>';
	}
	// Server configuration line
	$('#server-list > tbody:last').append('<tr>'+cols.join()+'</tr>');
	addServerTab(server.hostname);
	return listChannels(server.hostname);
    });
}

function addServerClear() {
    $('#hostname').parent().parent().removeClass("error");
    $('#hostname').next('.help-inline').empty();
}

function addServer(event) {
    event.preventDefault();
    $.ajax({
	type: 'POST',
	url: '../api/networks',
	data: $(this).serialize(),
	dataType: 'json',
	success: function() {
	    //$('#new-server').modal('hide');
	    // Connect to a new server by default
	    serverSettings($('#hostname').val(), true, $('#nick').val());
	},
	error: function(xhr, status, error) {
	    if (xhr.status == 409) {
		$('#hostname').keypress(addServerClear);
	    }
	    $('#hostname').parent().parent().addClass("error");
	    var error = $.parseJSON(xhr.responseText);
	    $('#hostname').next('.help-inline').text(error);
	}
    });
}

function serverSettings(server, enabled, nick) {
    $.ajax({
	type: 'POST',
	url: '../api/networks/' + server,
	data: {'enabled':enabled, 'nick':nick},
	dataType: 'json',
	success: function() {
	    // Refresh the list on success
	    listServers();
	},
	error: function(res, status, xhr) {
	    alert("toggleServer failed: "+res);
	}
    });
}

function gotVerifiedEmail(assertion) {
    if (assertion !== null) {
	$.ajax({
	    type: 'POST',
	    url: '../api/login',
	    dataType: 'json',
	    data: { assertion: assertion },
	    success: function(res, status, xhr) {
		if (res === null) loggedOut();
		else loggedIn(res);
	    },
	    error: function(res, status, xhr) {
		loggedOut();
		alert("login failure" + res);
	    }
	});
    }
    else {
	loggedOut();
    }
}

$(document).ready(function() {
    if (!navigator.id) {
        $('#browserid').hide();
        return;
    }

    $.get('../api/whoami', function (res) {
	if (res === null) loggedOut();
	else loggedIn(res);
    }, 'json');

    $('#browserid').click(function() {
	$('#browserid').css('opacity', '0.4');
        navigator.id.get(gotVerifiedEmail);
    });

});
