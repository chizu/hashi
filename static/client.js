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
	var url = '/api/networks/' + $('#hostname').val();
	$.ajax({
		type: 'POST',
		url: url,
		data: $(this).serialize(),
		success: function() {
			$('#new-server').modal('hide');
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
