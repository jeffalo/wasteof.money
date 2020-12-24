var d = document,
  x,
  l = d.links,
  ActiveXObject,
  p = {},
  w = window;
w.onkeyup = function(e) {
  p[e.key] = undefined;
};
w.onkeydown = function(e) {
  p[e.key] = true;
};
function defresh(r, a) {
  if (window.XMLHttpRequest && window.history) {
    x = new XMLHttpRequest();
  }
  x.onreadystatechange = function() {
    if (
      this.readyState == 4 &&
      this.responseText.indexOf("defresh.js") >= 0 &&
      r != w.location.pathame
    ) {
      if (a.toLowerCase() == "push") {
        w.history.pushState({ page: r }, "", r);
      }
      if (a.toLowerCase() == "replace") {
        w.history.replaceState({ page: r }, "", r);
      }
      o(this.responseText);
    }
    if (
      (this.readyState == 4 && this.responseText.indexOf("defresh.js") < 0) ||
      !window.XMLHttpRequest ||
      !window.history
    ) {
      if (a.toLowerCase() == "replace") {
        w.location.replace(r);
      }
      if (a.toLowerCase() == "push") {
        w.location.href = r;
      } else {
        o(this.responseText);
      }
    }
    function o(e) {
      if ("scrollRestoration" in w.history) {
        w.history.scrollRestoration = "manual";
      }
      w.scrollTo(0, 0);
      d.open();
      d.write(e);
      d.close();
    }
  };
  x.open("GET", r + "#" + Date.now(), true);
  x.send();
}
setInterval(function() {
  for (var i = 0; i < l.length; i++) {
    if (
      l[i].href.indexOf(w.location.hostname) >= 0 &&
      l[i].href != null &&
      l[i].onclick == null &&
      l[i].target != "_blank" &&
      l[i].target != "_parent" &&
      l[i].href.indexOf(".js") < 0 &&
      l[i].href.indexOf(".css") < 0 &&
      l[i].href.indexOf(".txt") < 0 &&
      !l[i].hasAttribute("download")
    ) {
      l[i].onclick = function(e) {
        if (
          p["Control"] != true &&
          p["Shift"] != true &&
          p["Meta"] != true &&
          this.href.charAt(0) != "#"
        ) {
          e.preventDefault();
          defresh(this.href, "push");
        }
      };
    }
  }
}, 500);
w.onpopstate = function() {
  defresh(w.location.pathname, "none");
};