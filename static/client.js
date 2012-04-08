var current_event = 0;

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
    //$('#new-server').submit(addServer);
    listServers();
    $('#usermenu .dropdown-toggle').html(email + '<b class="caret" />');
    $('.dropdown-toggle').dropdown();
    $('.logged-out').hide();
    $('.logged-in').show();
    startPoll();
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
    return '<div class="subnav subnav-fixed"><ul class="nav nav-pills channels-nav"><li><a class="btn-primary" data-toggle="modal" href="#'+modal_id+'"><i class="icon-plus icon-white"/></a></li></ul></div><div class="tab-content"></div><div id="'+modal_id+'" class="modal fade hide"><div class="modal-header">Join a channel!<a class="close" data-dismiss="modal"><i class="icon-remove" /></a></div><div class="modal-body"><form class="form-inline"><input type="text" class="input channel-name" placeholder="Channel" /> <input type="text" class="input channel-key" placeholder="Key" /></form></div><div class="modal-footer"><a href="'+modal_url+'" class="btn btn-primary">Join</a></div></div>';
}

function handlePoll(data) {
    $.each(data, function(index, msg) {
	if (msg["kind"] == "privmsg" || msg["kind"] == "action") {
	    var nick = msg["args"][0].split('!')[0];
	    var lines = [[msg["event_id"], nick, msg["args"][2], msg["kind"]]];
	    var channel = msg["args"][1];
	    
	    if (channel == msg["identity"]) {
		// Talking to ourselves... private messages
		newChannelMessages(lines, msg["network"], nick);
	    }
	    else {
		newChannelMessages(lines, msg["network"], channel);
	    }
	}
    });
}

function startPoll() {
    // Poll for events forever!
    (function poll(){
	$.ajax({ url: "/api/poll", 
		 success: handlePoll, 
		 dataType: "json",
		 complete: poll,
		 timeout: 5000
	       });
    })();
}

function channelURL(prefix, channel) {
    return prefix + '/' + encodeURIComponent(channel);
}

function channelMessagesURL(hostname, channel) {
    return channelURL('/api/networks/'+hostname, channel)+'/messages';
}

function channelInput(event) {
    event.preventDefault();
    $.ajax({
	type: 'POST',
	url: event.data.url,
	// Fix this - use real JSON encoding (why does jquery not do that?)
	data: '{"privmsg":"'+$(event.data.id).val()+'"}',
	dataType: 'json',
	contentType: 'application/json',
	success: function () {
	    $(event.data.id).val("");
	}
    });
}

function newChannelMessages(channel_messages, hostname, channel) {
    var hostname_id = hostnameId(hostname);
    var channel_id = hostname_id + '-' + channel;
    // Options passed with the form submit for channel input
    var options = {url:channelMessagesURL(hostname, channel),
		   id:eid(channel_id)+'-input'};

    // If we're just getting a message from somewhere new, add the pills
    if (!$(eid(channel_id)).length) {
	// Fixme: Will break with multiple servers
	$('.channels-nav')
	    .append('<li><a href="#'+hostname_id+'-'+channel+'" data-toggle="tab">'+channel+'</a></li>');
	$('#'+hostname_id).children('.tab-content')
	    .append('<div id="'+channel_id+'" class="tab-pane"><table class="irc-body"></table></div>');
	$(eid(channel_id)).append('<form><input class="channel-input" id="'+channel_id+'-input" name="'+channel+'" size="16" type="text" /></form>');
	$(eid(channel_id)).children('form').submit(options, channelInput);
    }

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
	msg_col.text(String(val[2]));
	msg_col.html(msg_col.html().replace(url_exp, '<a href="$1">$1</a>'));
	nick_text = String(val[1]);
	nick_color = "#"+intToDark(hashCode(nick_text));
	row.css("color", nick_color);
	nick_col.text(nick_text);
	if (val[3] == "action") {
	    msg_col.addClass('action');
	}
	row.append(nick_col);
	row.append(msg_col);
	irc_body.append(row);
    });

    // Scroll if new lines in the current channel and scrolled down
    if ($(eid(channel_id)).hasClass("active") && scrolled_down) {
	$('html, body').animate({scrollTop: $(document).height()}, 800);
    }
}


function refreshChannel(hostname, channel) {
    $.getJSON(channelMessagesURL(hostname, channel), function (channel_messages) {
	// Newest message before we reverse it
	current_event = Math.max(channel_messages[0], current_event);
	channel_messages.reverse();
	newChannelMessages(channel_messages, hostname, channel);
    });
}

function joinChannel(event) {
    event.preventDefault();
    var form = $(this).parent().parent()
	.children(".modal-body")
	.children(".form-inline");
    var channel_name = form.children(".channel-name").val();
    var channel_key = form.children(".channel-key").val();
    $.ajax({
	type: 'POST',
	url: channelURL($(this).attr('href'), channel_name),
	// Fix this - use real JSON encoding (why does jquery not do that?)
	data: '{"key":"'+channel_key+'"}',
	dataType: 'json',
	contentType: 'application/json',
	success: function () {
	    console.log("Joining "+channel_name+" with key "+channel_key);
	    $(".modal").modal('hide');
	}
    });
}

function listChannels(hostname) {
    var url = '/api/networks/'+hostname;
    var hostname_id = hostnameId(hostname);
    $('#'+hostname_id).append(serverControls(hostname));
    $('#'+hostname_id+'-channel-join .modal-footer a').click(joinChannel);
    $('#'+hostname_id+' .modal').modal('hide');
    $.getJSON(url, function (channel_list) {
	$.each(channel_list, function(index, val) {
	    refreshChannel(hostname, val);
	});
    });
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
    listChannels(hostname);
}

function listServers() {
    $("#server-list tbody tr").remove();
    $.getJSON('/api/networks', function (server_list) {
	$.each(server_list, function(index, val) {
	    var cols = new Array();
	    // Enabled server
	    if (val[0]) {
		cols[0] = '<td><input type="checkbox" class="server-disable" checked /></td>';
	    }
	    else {
		cols[0] = '<td><input type="checkbox" class="server-enable" /></td>';
	    }
	    cols[1] = '<td>'+val[1]+'</td>';
	    cols[2] = '<td>'+val[2]+'</td>';
	    // SSL configuration
	    if (val[3]) {
		// Remove disabled when this is implemented
		cols[3] = '<td><a class="btn btn-small btn-success disabled"><i class="icon-lock icon-white" /> Enabled</a></td>';
	    }
	    else {
		cols[3] = '<td><a class="btn btn-small btn-danger disabled"><i class="icon-ban-circle icon-white" /> Disabled</a></td>';
	    }
	    // Nick configured yet?
	    if (val[4]) {
		cols[4] = '<td><input type="text" class="disabled" value="'+val[4]+'" /></td>';
	    }
	    else {
		cols[4] = '<td><input type="text" class="disabled" /></td>';
	    }
	    // Server configuration line
	    $('#server-list > tbody:last').append('<tr>'+cols.join()+'</tr>');
	    addServerTab(val[1]);
	});
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
