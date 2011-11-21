function setSessions(val) {
	if (navigator.id) {
		navigator.id.sessions = val ? val : [ ];
	}
}

function loggedIn(email) {
	setSessions([ { email: email } ]);
	$('#logout').bind('click', logout);
	$('#usermenu').dropdown();
	$('#usermenu .dropdown-toggle').html(email);
	// Swap the buttons
	$('#browserid').hide();
	$('#usermenu .dropdown-toggle').show();
}

function loggedOut() {
	setSessions();
	// Swap buttons back
	$('#usermenu .dropdown-toggle').hide();
	$('#browserid').show();
	$('#browserid').css('opacity', '1.0');
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

function gotVerifiedEmail(assertion) {
    if (assertion !== null) {
		$.ajax({
			type: 'POST',
			url: '/api/login',
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
