function NetworkConfigController($scope) {
    
}

function NetworkController($scope, $routeParams) {
    $scope.hostname = $routeParams.hostname;
}


function ChannelController($scope, $routeParams) {
    $scope.name = $routeParams.channel;

}

function LandingController($scope) {
    
}

function NavigationController($scope, $location, $cookies) {
    $scope.networks = [
	{"hostname":"irc.freenode.org"},
	{"hostname":"irc.reddit.com"}
    ];
    $scope.routeIs = function(routeName) {
	return $location.path() === routeName;
    };
    if ($cookies.TWISTED_SESSION) {
	// Server gave us a session key - use the old login
	$scope.email = $cookies.email;
    }
    else {
	// No session key - need to log in
	delete $cookies.email;
	$scope.email = null;
    }
    $scope.login = function () {
	navigator.id.watch({
	    loggedInUser: $scope.email,
	    onlogin: function (assertion) {
		$.ajax({
		    type: 'POST',
		    url: '../api/login',
		    dataType: 'json',
		    data: { assertion: assertion },
		    success: function(res, status, xhr) {
			if (res === null) {
			    console.log("bad browserid assertion");
			}
			else {
			    console.log("login success", res.email);
			    $cookies.email = res.email;
			    $scope.email = res.email;
			    $scope.$apply();
			}
		    },
		    error: function(res, status, xhr) {
			console.log("login failure: " + res);
		    }
		});
	    },
	    onlogout: function () {
		console.log("logout");
	    },
	});
	navigator.id.request();
    };
}