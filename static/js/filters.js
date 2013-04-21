angular.module('HashiFilters', []).filter('encodeURIComponent', function() {
    return function(input) {
	return encodeURIComponent(input);
    };
});