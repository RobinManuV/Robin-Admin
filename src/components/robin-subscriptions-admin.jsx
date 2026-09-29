import { SubscriberAdmin } from "../robin-subscriptions/portal-source/src/features/admin/SubscriberAdmin.jsx";
import "../robin-subscriptions/portal-source/src/application/subscription-portal.css";

export function RobinSubscriptionsAdmin({ user }) {
  return <div className="robin-platform-admin robin-subscriptions-admin"><SubscriberAdmin user={user} embedded /></div>;
}
