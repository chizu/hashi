function NetworkConfigController($scope, Networks) {
    $scope.networks = Networks.query();
}

function NetworkController($scope, $routeParams, Channels) {
    $scope.hostname = $routeParams.hostname;
    $scope.channels = Channels.query({"hostname": $scope.hostname});
}


function ChannelController($scope, $routeParams) {
    $scope.name = $routeParams.channel;

}

function LandingController($scope) {
}


function NavigationController($scope, $location, $cookies, Networks, authService) {
    function invalid_session() {
	// No session key - need to log in
	delete $cookies.email;
	$scope.email = null;
    }

    function network_success() {
	if ($cookies.TWISTED_SESSION) {
	    // Server gave us a session key - use the old login
	    $scope.email = $cookies.email;
	}
	else {
	    invalid_session();
	}
    }

    function network_failure(response) {
	if (response.status === 401) {
	    invalid_session();
	}
    }

    $scope.networks = Networks.query({}, network_success, network_failure);

    $scope.routeIs = function(routeName) {
	return $location.path() === routeName;
    };

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
			    $scope.$apply(function () {
				authService.loginConfirmed();
				console.log("login success", res.email);
				$cookies.email = res.email;
				$scope.email = res.email;
				$location.path("/network");
			    });
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

    $scope.logout = function () {
	navigator.id.logout();
	delete $cookies.email;
	delete $cookies.TWISTED_SESSION;
	$scope.email = null;
	$location.path("/landing");
    };
}