var WgAppHeader = (function () {
    function WgAppHeader() {
        this.Title = "Jimmy D";
    }
    return WgAppHeader;
}());
var PgHome = (function () {
    function PgHome() {
        this.AppHeader = new WgAppHeader();
    }
    return PgHome;
}());
