import { AdminPortal } from "../robin-platform/portal-source/src/application/AdminPortal.jsx";
import "../robin-platform/portal-source/src/index.css";

export function RobinStudentsAdmin({ user }) {
  return <div className="robin-platform-admin"><AdminPortal user={user} embedded /></div>;
}
