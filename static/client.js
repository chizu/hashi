function setSessions(val) {
	if (navigator.id) {
		navigator.id.sessions = val ? val : [ ];
	}
}

function loggedIn(email) {
	setSessions([ { email: email } ]);
	$('#browserid').hide();
}

function loggedOut() {
	setSessions();
	$('#browserid').css('opacity', '1.0');
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

    $('#browserid').click(function() {
		$('#browserid').css('opacity', '0.4');
        navigator.id.getVerifiedEmail(gotVerifiedEmail);
    });
});
