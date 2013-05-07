angular.module('Hashi', ['HashiServices', 'HashiFilters', 'http-auth-interceptor', 'ngCookies'])
    .config(['$routeProvider', function($routeProvider) {
	$routeProvider.
	    when('/network', {templateUrl: 'partials/network-config.html',
			      controller: NetworkConfigController}).
	    when('/network/:hostname', {templateUrl: 'partials/network.html',
					controller: NetworkController}).
	    when('/network/:hostname/:channel', {templateUrl: 'partials/network.html',
						 controller: NetworkController}).
	    when('/landing', {templateUrl: 'partials/landing.html',
			      controller: LandingController}).
	    otherwise({redirectTo: '/landing'});
    }])
    .directive('HashiApplication', function() {
	return {
	    restrict: 'C',
	    link: function(scope, elem, attrs) {
		//once Angular is started, remove class:
		elem.removeClass('waiting-for-angular');

		scope.$on('event:auth-loginRequired', function() {
		});
		scope.$on('event:auth-loginConfirmed', function() {
		});
	    }
	}
    });
