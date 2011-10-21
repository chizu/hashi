$(document).ready(function() {
	base = "/api/networks";
	$.getJSON(base, function(networks) {
		network_count = networks.length;
		for (n=0; n < network_count; n++) {
			$("#root").add("<div id=\"" + networks[n] + "\"/>");
			$.getJSON(base + "/" + networks[n], function(channels) {
				$("#"+networks[n]).append(channels[0]);
			});
		}
	});
});
