import { ElizaClient } from "./client-base";
ElizaClient.prototype.listNotifications = async function (opts) {
    const params = new URLSearchParams();
    if (opts?.unreadOnly)
        params.set("unreadOnly", "true");
    if (opts?.category)
        params.set("category", opts.category);
    if (typeof opts?.limit === "number")
        params.set("limit", String(opts.limit));
    const query = params.toString();
    return this.fetch(`/api/notifications${query ? `?${query}` : ""}`);
};
ElizaClient.prototype.createNotification = async function (input) {
    return this.fetch("/api/notifications", {
        method: "POST",
        body: JSON.stringify(input),
    });
};
ElizaClient.prototype.markNotificationRead = async function (id) {
    return this.fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
};
ElizaClient.prototype.markAllNotificationsRead = async function () {
    return this.fetch("/api/notifications/read-all", {
        method: "POST",
    });
};
ElizaClient.prototype.removeNotification = async function (id) {
    return this.fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });
};
ElizaClient.prototype.clearNotifications = async function () {
    return this.fetch("/api/notifications", {
        method: "DELETE",
    });
};
