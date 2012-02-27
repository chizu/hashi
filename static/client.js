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

function serverControls(hostname_id) {
    return '<div class="subnav subnav-fixed"><ul class="nav nav-pills channels-nav"></ul></div><div class="tab-content"></div>';
}

function startPoll() {
    // Poll for events forever!
    (function poll(){
	$.ajax({ url: "/api/poll", 
		 success: function(data){
		     //["irc.freenode.org", "hashi", "privmsg", "hashi", "##emo", "more testing"]
		     newChannelMessages([[data[3].split('!')[0], data[5]],], 
					data[0], data[4]);
		 }, 
		 dataType: "json",
		 complete: poll,
		 timeout: 5000
	       });
    })();
}

function channelURL(hostname, channel) {
    return '/api/networks/'+hostname+'/'+encodeURIComponent(channel)+'/messages';
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
    var options = {url:channelURL(hostname, channel),
		   id:eid(channel_id)+'-input'};

    channel_messages.reverse();
    
    // Create the pill content divs if needed (initial load)
    if (!$('#'+hostname_id+' .tab-content > '+eid(channel_id)).length) {
	$('#'+hostname_id).children('.tab-content')
	    .append('<div id="'+channel_id+'" class="tab-pane"><div class="irc-body"></div></div>');
	$(eid(channel_id)).append('<form><input class="channel-input" id="'+channel_id+'-input" name="'+channel+'" size="16" type="text" /></form>');
	$(eid(channel_id)).children('form').submit(options, channelInput);
    }
    
    var irc_body = $(eid(channel_id)+' div.irc-body');

    // Stick new message rows in the div
    $.each(channel_messages, function(index, val) {
	irc_body.append('<div class="row-fluid"><div class="nick span2">&lt; '+val[0]+'&gt;</div><div class="span10 privmsg">'+val[1]+'</div></div>');
    });
}


function refreshChannel(hostname, channel) {
    $.getJSON(channelURL(hostname, channel), function (channel_messages) {
	newChannelMessages(channel_messages, hostname, channel);
    });
}

function listChannels(hostname) {
    var url = '/api/networks/'+hostname;
    var hostname_id = hostnameId(hostname);
    $('#'+hostname_id).append(serverControls(hostname_id));
    $.getJSON(url, function (channel_list) {
	$.each(channel_list, function(index, val) {
	    // Fixme: Will break with multiple servers
	    $('.channels-nav')
		.append('<li><a href="#'+hostname_id+'-'+val+'" data-toggle="tab">'+val+'</a></li>');
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
	    // SSL heart or skull
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

function addServer() {
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
