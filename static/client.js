var current_event = 0;

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
    var ws_url = ws_protocol+'://'+window.location.hostname+':'+window.location.port+'/api/websocket';
}
else {
    var ws_url = ws_protocol+'://'+window.location.hostname+'/api/websocket';
}
var socket = null;

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

function scrollBottom(speed) {
    $('html, body').animate({scrollTop: $(document).height()}, speed);
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
	url: '/api/logout',
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
    modal_url = '/api/networks/'+hostname;
    return '<div class="subnav subnav-fixed"><ul class="nav nav-pills channels-nav"><li><a class="btn-primary" data-toggle="modal" href="#'+modal_id+'"><i class="icon-plus icon-white"/></a></li></ul></div><div class="tab-content"></div><div id="'+modal_id+'" class="modal fade hide"><div class="modal-header">Open a tab!<a class="close" data-dismiss="modal"><i class="icon-remove" /></a></div><div class="modal-body"><form class="form-inline"><input type="text" class="input channel-name" placeholder="Channel or User" /> <input type="text" class="input channel-key" placeholder="Key" /></form></div><div class="modal-footer"><a href="'+modal_url+'" class="btn btn-primary">Open</a></div></div>';
}

function handleEvent(event) {
    $.each([JSON.parse(event.data)], function(index, msg) {
	// Filter out the two kinds of messages that need userlist state
	if (msg["kind"] != "userQuit" && msg["kind"] != "userRenamed") {
	    var nick = msg["args"][0].split('!')[0];
	    var lines = [[msg["event_id"], nick, msg["args"][2], msg["kind"]]];
	    var channel = msg["args"][1];
	    
	    if (channel == msg["identity"]) {
		// Talking to ourselves... private messages
		addChannelTab(msg["network"], nick);
		newChannelMessages(lines, msg["network"], nick);
	    }
	    else {
		addChannelTab(msg["network"], channel);
		newChannelMessages(lines, msg["network"], channel);
	    }
	}
    });
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
}

function channelURL(prefix, channel) {
    return prefix + '/' + encodeURIComponent(channel);
}

function channelMessagesURL(hostname, channel) {
    return channelURL('/api/networks/'+hostname, channel)+'/messages';
}

function channelUsersURL(hostname, channel) {
    return channelURL('/api/networks/'+hostname, channel)+'/users';
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
    scrollBottom(0);
}

function channelID(hostname_id, channel) {
    return hostname_id + '-' + String(channel).replace('/', '-slash-');
}

function refreshUserList(hostname, channel) {
    return $.getJSON(channelUsersURL(hostname, channel), function (users) {
	servers[hostname].channels[channel].users = users;
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
	link.bind('shown', switchChannelTab);
	li = $(document.createElement('li'));
	li.append(link);
	$('#'+hostname_id).find('.channels-nav').append(li);
	
	$('#'+hostname_id).children('.tab-content')
	    .append('<div id="'+channel_id+'" class="tab-pane"><table class="irc-body"></table></div>');
	$(eid(channel_id)).append('<form><input class="channel-input" id="'+channel_id+'-input" name="'+channel+'" size="16" type="text" /></form>');
	$(eid(channel_id)).children('form').submit(options, channelInput);
	users_handle = $(document.createElement('div'))
	users_handle.addClass('left-grab');
	users_handle.addClass('btn').addClass('btn-info');
	users_handle.append('<i class="icon-chevron-left icon-white"></i>');
	users_handle.click({hostname: hostname, channel: channel},
			   refreshUserList);
	$(eid(channel_id)).append(users_handle);
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

function newChannelMessages(channel_messages, hostname, channel) {
    var hostname_id = hostnameId(hostname);
    var channel_id = channelID(hostname_id, channel);
    var irc_body = $(eid(channel_id)+' table.irc-body');

    if ($(window).scrollTop() + $(window).height() == $(document).height()) {
	scrolled_down = true;
    }
    else {
	scrolled_down = false;
    }

    // Stick new message rows in the div
    $.each(channel_messages, function(index, val) {
	row = $(document.createElement('tr'));
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
	row.append(nick_col);
	row.append(msg_col);
	irc_body.append(row);
    });

    // Scroll if new lines in the current channel and scrolled down
    if ($(eid(channel_id)).hasClass("active") && scrolled_down) {
	scrollBottom(800);
    }
}

function updateChannel(hostname, channel) {
    return $.getJSON(channelMessagesURL(hostname, channel), function (msgs) {
	// Newest message before we reverse it
	current_event = Math.max(msgs[0], current_event);
	msgs.reverse();
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
    var url = '/api/networks/'+hostname;
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
    return $.getJSON('/api/networks', function (server_list) {
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
	url: '/api/networks',
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
	url: '/api/networks/' + server,
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
	    url: '/api/login',
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

    $.get('/api/whoami', function (res) {
	if (res === null) loggedOut();
	else loggedIn(res);
    }, 'json');

    $('#browserid').click(function() {
	$('#browserid').css('opacity', '0.4');
        navigator.id.get(gotVerifiedEmail);
    });

});
