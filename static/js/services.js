angular.module('HashiServices', ['ngResource']).
    factory('Network', function($resource){
	return $resource('/hashi/api/network/:hostname', {hostname: 'hostname'});
    });