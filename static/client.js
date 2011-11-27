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

function addServer() {
	event.preventDefault();
	$.ajax({
		type: 'POST',
		url: '/api/networks',
		data: $(this).serialize(),
		success: function() {
			// Connect to a new server by default
			toggleServer($('#hostname').val(), true);
			$('#new-server').modal('hide');
		},
		error: function(res, status, xhr) {
			alert("addServer failed: "+res);
		}
	});
}

function toggleServer(server, toggle) {
	$.ajax({
		type: 'POST',
		url: '/api/networks/' + server,
		data: toggle,
		dataType: 'json',
		success: function() {
			alert("Toggle server should do something ;_;");
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
