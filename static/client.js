function setSessions(val) {
	if (navigator.id) {
		navigator.id.sessions = val ? val : [ ];
	}
}

function loggedIn(email) {
	setSessions([ { email: email } ]);
	$('#logout').bind('click', logout);
	$('#new-server').submit(addServer);
	$('#new-server').modal({
		keyboard: true,
		backdrop: true
	});
	listServers();
	$('#usermenu').dropdown();
	$('#usermenu .dropdown-toggle').html(email);
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

function switchServerTab() {
	var hostname_id = '#'+this.href.split('#')[1];
	$('#servers .active').removeClass('active');
	$('#servers').find(hostname_id).addClass('active');
}

function addServerTab(hostname) {
	hostname_id = hostname.replace(/\./g,'-');
	$('#servers-nav').append('<li><a href="#'+hostname_id+'">'+hostname+'</a></li>');
	$('#servers-nav a').click(switchServerTab);
	$('#servers').append('<div class="content" id="'+hostname_id+'">Fillller</div>');
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
				cols[3] = '<td><span class="ssl btn success small disabled">\u2665</span></td>';
			}
			else {
				cols[3] = '<td><span class="ssl btn danger small disabled">\u2620</td>';
			}
			// Nick configured yet?
			if (val[4]) {
				cols[4] = '<td><input type="text" class="disabled" value="'+val[4]+'" /></td>';
			}
			else {
				cols[4] = '<td><input type="text" class="disabled" /></td>';
			}
			// Server configuration line
			$('#server-list > tbody:last').append('<tr><form>'+cols.join()+'</form></tr>');
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
			$('#new-server').modal('hide');
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
        navigator.id.getVerifiedEmail(gotVerifiedEmail);
    });
});
