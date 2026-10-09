import { ArrowLeft, Mail, RefreshCw } from "lucide-react";

import { AlmaworksBrand } from "@/components/AlmaworksBrand";
import styles from "./onboarding-flow.module.css";

export function OnboardingPreparation({ error, onRetry, onReturnToLogin, signingOut, signOutError }: {
  error: string | null;
  onRetry: () => void;
  onReturnToLogin: () => void;
  signingOut: boolean;
  signOutError: string | null;
}) {
  const contactEmail = "lkr2124@columbia.edu";
  const contactHref = `mailto:${contactEmail}?subject=${encodeURIComponent("Help with Almaworks access")}`;

  return <main className={styles.preparationShell}>
    <header className={styles.preparationBrand}><AlmaworksBrand tone="white" iconSize={34} priority /></header>
    <section className={styles.preparation} aria-labelledby="preparation-heading" aria-busy={!error}>
      <p className={styles.preparationEyebrow}>Your Almaworks account</p>
      <h1 id="preparation-heading">{error ? "Let’s get your setup back on track." : "Loading your saved progress"}</h1>
      {error ? <>
        <p className={styles.preparationMessage} role="alert">{error}</p>
        <div className={styles.preparationActions}>
          <button type="button" className={styles.preparationPrimary} onClick={onRetry} disabled={signingOut}><RefreshCw size={17} aria-hidden="true" />Try again</button>
          <button type="button" className={styles.preparationSecondary} onClick={onReturnToLogin} disabled={signingOut}><ArrowLeft size={17} aria-hidden="true" />{signingOut ? "Signing out…" : "Back to login"}</button>
        </div>
        {signOutError && <p className={styles.preparationActionError} role="alert">{signOutError}</p>}
        <div className={styles.preparationHelp}>
          <Mail size={20} aria-hidden="true" />
          <div><h2>Need approval or a startup assignment?</h2><p>Email Layth with the email address you use to sign in and your startup’s name. Once your access is ready, return here and try again.</p><a href={contactHref}>{contactEmail}</a></div>
        </div>
        <p className={styles.preparationHint}>Back to login signs you out so you can use a different account.</p>
      </> : <p className={styles.preparationMessage} role="status">Your saved details will appear in a moment.</p>}
    </section>
  </main>;
}
