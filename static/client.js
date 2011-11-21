function setSessions(val) {
	if (navigator.id) {
		navigator.id.sessions = val ? val : [ ];
	}
}

function loggedIn(email) {
	setSessions([ { email: email } ]);
}

function loggedOut() {
	setSessions();
}

$(document).ready(function() {
    if (!navigator.id) {
        $('#browserid').hide();
        return;
    }

    $('#browserid').click(function() {
		$('#browserid').css('opacity', '0.5');
        navigator.id.getVerifiedEmail(function(assertion) {
            if (assertion) {
				alert("unverified login");
            }
			else {
				alert("failed");
			}
        });
    });
});
