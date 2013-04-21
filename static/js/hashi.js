angular.module('Hashi', ['HashiServices', 'ngCookies']).
    config(['$routeProvider', function($routeProvider) {
	$routeProvider.
	    when('/network', {templateUrl: 'partials/network-config.html',
			      controller: NetworkConfigController}).
	    when('/network/:hostname', {templateUrl: 'partials/network.html',
					controller: NetworkController}).
	    when('/network/:hostname/:channel', {templateUrl: 'partials/channel.html',
						 controller: ChannelController}).
	    when('/landing', {templateUrl: 'partials/landing.html',
			      controller: LandingController}).
	    otherwise({redirectTo: '/landing'});
    }]);
