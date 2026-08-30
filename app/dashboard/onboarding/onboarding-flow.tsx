"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { calculateOnboardingProgress, getOnboardingChecklist } from "@/src/lifecycle/onboarding";
import type { ProgramRole } from "@/src/lifecycle/types";
import { createClient } from "@/utils/supabase/client";

import styles from "./onboarding-flow.module.css";

type ParticipantRole = Extract<ProgramRole, "startup" | "mentor">;
type WizardStep = 1 | 2 | 3 | 4;

const DEFAULT_WINDOWS = [
  { id: "tue-am", day: "Tuesday", date: "Feb 9", time: "10:00 AM – 12:00 PM" },
  { id: "wed-pm", day: "Wednesday", date: "Feb 10", time: "1:00 – 4:00 PM" },
  { id: "thu-pm", day: "Thursday", date: "Feb 11", time: "3:00 – 6:00 PM" },
];

export default function OnboardingFlow() {
  const [role, setRole] = useState<ParticipantRole>("startup");
  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [description, setDescription] = useState("");
  const [expertise, setExpertise] = useState("Product strategy, Go-to-market");
  const [teamContact, setTeamContact] = useState("");
  const [selectedWindows, setSelectedWindows] = useState<Set<string>>(
    new Set(DEFAULT_WINDOWS.map((window) => window.id)),
  );
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? "");
      const { data } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.full_name) setName(data.full_name);
      if (data?.role === "mentor" || data?.role === "startup") setRole(data.role);
      const { data: membership } = await supabase
        .from("semester_memberships")
        .select("id, semester_id, status, role")
        .eq("profile_id", user.id)
        .in("status", ["invited", "onboarding"])
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (membership) {
        setMembershipId(membership.id);
        setSemesterId(membership.semester_id);
        if (membership.role === "mentor" || membership.role === "startup") setRole(membership.role);
      }
    });
  }, []);

  async function persistProgress(finalize = false) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !membershipId || !semesterId) {
      setSaveError("Your invitation is still being prepared. Please refresh and try again.");
      return false;
    }
    setSaving(true);
    setSaveError(null);
    const profileUpdate = await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", user.id);
    if (profileUpdate.error) {
      setSaveError(profileUpdate.error.message);
      setSaving(false);
      return false;
    }
    const rows = [
      { item_key: "identity", is_required: true, completed_at: name.trim() && email.trim() ? new Date().toISOString() : null, payload: { name: name.trim(), email: email.trim(), role } },
      { item_key: role === "startup" ? "company_snapshot" : "mentor_profile", is_required: true, completed_at: organization.trim() && description.trim() ? new Date().toISOString() : null, payload: { organization: organization.trim(), description: description.trim() } },
      { item_key: role === "startup" ? "team_contacts" : "expertise", is_required: true, completed_at: (role === "startup" ? teamContact.trim() : expertise.trim()) ? new Date().toISOString() : null, payload: role === "startup" ? { teamContact: teamContact.trim() } : { expertise: expertise.split(",").map((item) => item.trim()).filter(Boolean) } },
      { item_key: "availability", is_required: true, completed_at: selectedWindows.size > 0 ? new Date().toISOString() : null, payload: { windows: Array.from(selectedWindows) } },
    ];
    const progressResult = await supabase.from("onboarding_progress").upsert(rows.map((row) => ({ ...row, semester_id: semesterId, semester_membership_id: membershipId })), { onConflict: "semester_membership_id,item_key" });
    if (progressResult.error) {
      setSaveError(progressResult.error.message);
      setSaving(false);
      return false;
    }
    if (finalize && selectedWindows.size > 0) {
      const availability = DEFAULT_WINDOWS.filter((window) => selectedWindows.has(window.id)).map((window) => {
        const date = window.id === "tue-am" ? "2027-02-09" : window.id === "wed-pm" ? "2027-02-10" : "2027-02-11";
        return { semester_id: semesterId, profile_id: user.id, starts_at: `${date}T09:00:00-05:00`, ends_at: `${date}T17:00:00-05:00`, timezone: "America/New_York", source: "user" };
      });
      const availabilityResult = await supabase.from("availability_windows").delete().eq("semester_id", semesterId).eq("profile_id", user.id);
      if (availabilityResult.error) { setSaveError(availabilityResult.error.message); setSaving(false); return false; }
      const insertResult = await supabase.from("availability_windows").insert(availability);
      if (insertResult.error) { setSaveError(insertResult.error.message); setSaving(false); return false; }
    }
    setSaving(false);
    return true;
  }

  async function advance() {
    const ok = await persistProgress(step === 3);
    if (ok) setStep((current) => Math.min(4, current + 1) as WizardStep);
  }

  const completedKeys = useMemo(() => {
    const completed = new Set<string>();
    if (step > 1 || (name.trim() && email.trim())) completed.add("identity");
    const roleDetailsComplete = role === "startup"
      ? organization.trim() && description.trim() && teamContact.trim()
      : organization.trim() && description.trim() && expertise.trim();
    if (step > 2 || roleDetailsComplete) {
      completed.add(role === "startup" ? "company_snapshot" : "mentor_profile");
      completed.add(role === "startup" ? "team_contacts" : "expertise");
    }
    if (step > 3 || selectedWindows.size > 0) completed.add("availability");
    return completed;
  }, [description, email, expertise, name, organization, role, selectedWindows.size, step, teamContact]);
  const progress = calculateOnboardingProgress(role, completedKeys);
  const checklist = getOnboardingChecklist(role);

  function toggleWindow(id: string) {
    setSelectedWindows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.contextPanel}>
        <div className={styles.contextBrand}><span>AW</span><strong>Almaworks</strong></div>
        <div className={styles.contextCopy}>
          <p className={styles.eyebrow}>Spring 2027</p>
          <h1>Let’s make your first session useful.</h1>
          <p>Three short steps give the program enough context to make thoughtful introductions. You can refine everything later.</p>
        </div>
        <ol className={styles.steps}>
          {[{ id: 1, icon: UserRound, label: "You" }, { id: 2, icon: role === "startup" ? Building2 : Sparkles, label: role === "startup" ? "Company" : "Expertise" }, { id: 3, icon: CalendarClock, label: "Availability" }].map(({ id, icon: Icon, label }) => (
            <li key={id} className={step === id ? styles.currentStep : step > id ? styles.finishedStep : ""}>
              <span>{step > id ? <Check size={14} /> : <Icon size={15} />}</span><div><small>Step {id}</small><strong>{label}</strong></div>
            </li>
          ))}
        </ol>
        <div className={styles.savedNote}><CheckCircle2 size={15} /><span>Your progress saves as you go.</span></div>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.formTop}>
          <span>{Math.min(step, 3)} of 3</span><div><i style={{ width: `${Math.min(step, 3) / 3 * 100}%` }} /></div><button type="button" onClick={() => void persistProgress()} disabled={saving}>{saving ? "Saving…" : "Save progress"}</button>
        </div>

        <div className={styles.formBody}>
          {step === 1 && (
            <section>
              <p className={styles.eyebrow}>Start with the basics</p><h2>Confirm who you are</h2><p className={styles.lede}>We filled in what we know from your invitation. Make any corrections before continuing.</p>
              <div className={styles.rolePreview}><span className={role === "startup" ? styles.roleIconStartup : styles.roleIconMentor}>{role === "startup" ? <UsersRound size={18} /> : <Sparkles size={18} />}</span><div><small>You’re joining as</small><strong>{role === "startup" ? "Startup team member" : "Mentor"}</strong></div><span className={styles.hint}>Set by your invitation</span></div>
              <div className={styles.fieldGrid}><label>Full name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" /></label><label>Email address<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" autoComplete="email" /></label></div>
              <p className={styles.hint}>This email is tied to your secure sign-in link.</p>
            </section>
          )}

          {step === 2 && role === "startup" && (
            <section>
              <p className={styles.eyebrow}>A clear snapshot</p><h2>Tell mentors what you’re building</h2><p className={styles.lede}>Keep it lightweight. A few sentences are enough to start; your teammates can improve this together later.</p>
              <label>Company name<input value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="Company name" /></label>
              <label>Company snapshot<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What are you building, for whom, and what would make this semester valuable?" rows={5} /><span className={styles.fieldMeta}>{description.length}/500</span></label>
              <label>Primary team contact<input value={teamContact} onChange={(event) => setTeamContact(event.target.value)} placeholder="Name or email" /></label>
              <div className={styles.defaultNote}><Sparkles size={16} /><div><strong>Team access is collaborative by default</strong><p>Every active teammate can update this profile, contact details, and shared availability.</p></div></div>
            </section>
          )}

          {step === 2 && role === "mentor" && (
            <section>
              <p className={styles.eyebrow}>Share where you help best</p><h2>Shape your mentor profile</h2><p className={styles.lede}>Founders use this snapshot to understand your perspective before requesting time.</p>
              <label>Company or affiliation<input value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="Company, fund, or independent" /></label>
              <label>Short biography<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A concise introduction to your experience and mentoring style" rows={4} /><span className={styles.fieldMeta}>{description.length}/400</span></label>
              <label>Expertise<input value={expertise} onChange={(event) => setExpertise(event.target.value)} /><span className={styles.hint}>Separate topics with commas. You can tune these after onboarding.</span></label>
            </section>
          )}

          {step === 3 && (
            <section>
              <p className={styles.eyebrow}>One last essential</p><h2>When are you usually free?</h2><p className={styles.lede}>We selected the program’s recommended windows. Deselect anything that doesn’t work; exact meeting times are confirmed later.</p>
              <div className={styles.windowList}>
                {DEFAULT_WINDOWS.map((window) => {
                  const selected = selectedWindows.has(window.id);
                  return <button type="button" key={window.id} className={selected ? styles.windowSelected : ""} onClick={() => toggleWindow(window.id)}><span className={styles.checkBox}>{selected && <Check size={13} />}</span><span className={styles.dateBlock}><strong>{window.day}</strong><small>{window.date}</small></span><span className={styles.timeBlock}><Clock3 size={15} />{window.time}</span><span className={styles.recommended}>{window.id === "wed-pm" ? "Most popular" : ""}</span></button>;
                })}
              </div>
              <div className={styles.defaultNote}><Sparkles size={16} /><div><strong>Defaults, not commitments</strong><p>These windows improve matching. You’ll approve each session request before it is scheduled.</p></div></div>
            </section>
          )}

          {step === 4 && (
            <section className={styles.completeState}>
              <span><Check size={28} /></span><p className={styles.eyebrow}>Essentials complete</p><h2>You’re ready for Spring 2027.</h2><p>We’ll take you to your dashboard. Optional details stay in a short checklist, so your profile can get stronger over time without blocking you today.</p>
              <div className={styles.summaryCard}><div><strong>{progress.required.completed}/{progress.required.total}</strong><small>Required tasks</small></div><div><strong>{selectedWindows.size}</strong><small>Available windows</small></div><div><strong>{role === "startup" ? "Shared" : "Personal"}</strong><small>Profile access</small></div></div>
              <div className={styles.nextChecklist}><strong>Keep improving when you have a minute</strong>{checklist.filter((item) => !item.required).map((item) => <span key={item.key}><i />{item.label}</span>)}</div>
              <button className={styles.primaryButton} onClick={() => router.push(role === "mentor" ? "/dashboard/mentor" : "/dashboard/startup")}>Go to my dashboard <ArrowRight size={16} /></button>
            </section>
          )}
        </div>

        {step < 4 && (
          <footer className={styles.footer}>
            <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1) as WizardStep)} disabled={step === 1}><ArrowLeft size={15} /> Back</button>
            <span>{step === 3 ? `${selectedWindows.size} windows selected` : "About 2 minutes remaining"}</span>
            <button type="button" className={styles.primaryButton} onClick={() => void advance()} disabled={saving || (step === 1 && (!name.trim() || !email.trim())) || (step === 2 && (!organization.trim() || !description.trim() || (role === "startup" ? !teamContact.trim() : !expertise.trim()))) || (step === 3 && selectedWindows.size === 0)}>{saving ? "Saving…" : step === 3 ? "Finish setup" : "Continue"}<ArrowRight size={15} /></button>
          </footer>
        )}
        {saveError && <p role="alert" className={styles.hint}>{saveError}</p>}
      </main>
    </div>
  );
}
