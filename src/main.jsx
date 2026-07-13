import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import ComputerDoctor from "./ComputerDoctor.jsx";
import Login from "./Login.jsx";
import { api } from "./lib/api.js";

function Root() {
  const [session, setSession] = useState(undefined); // undefined = still checking

  useEffect(() => {
    api.auth.session().then(({ data }) => setSession(data.session));
    const { data } = api.auth.onChange(setSession);
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null; // avoid a login flash on reload
  if (!session) return <Login />;

  return (
    <ComputerDoctor
      user={session.user}
      onSignOut={() => api.auth.signOut()}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
