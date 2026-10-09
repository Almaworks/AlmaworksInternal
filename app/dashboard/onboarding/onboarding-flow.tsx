"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AlmaworksBrand } from "@/components/AlmaworksBrand";
import { CalendarConnectionCard } from "@/components/calendar/CalendarConnectionCard";
import { ExpertiseTagPicker } from "@/components/ExpertiseTagPicker";
import { buildOnboardingWrites, calculateOnboardingProgress, getOnboardingChecklist, isRoleSetupSaveConfirmed, onboardingPreparationError, selectActiveOnboardingMembership, startupAssignmentPreparationError } from "@/src/lifecycle/onboarding";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import type { ProgramRole } from "@/src/lifecycle/types";
import { restoreOnboardingDraft, type AvailabilitySetupChoice, type OnboardingDraft } from "@/src/lifecycle/onboarding-draft";
import { createClient } from "@/utils/supabase/client";
import { signOutParticipant } from "@/src/auth/participant-sign-out";
import { OnboardingPreparation } from "./OnboardingPreparation";

import styles from "./onboarding-flow.module.css";

type ParticipantRole = Extract<ProgramRole, "startup" | "mentor">;
type WizardStep = 1 | 2 | 3 | 4;

export default function OnboardingFlow() {
  const [role, setRole] = useState<ParticipantRole>("startup");
  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [description, setDescription] = useState("");
  const [expertise, setExpertise] = useState<string[]>([]);
  const [teamContact, setTeamContact] = useState("");
  const [availabilityChoice, setAvailabilityChoice] = useState<AvailabilitySetupChoice>("set-hours-next");
  const [semesterName, setSemesterName] = useState("your semester");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [calendarConnecting, setCalendarConnecting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const saveInFlight = useRef(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) throw new Error(onboardingPreparationError(false));
      if (cancelled) return;
      setEmail(user.email ?? "");
      const [profileResult, semesterResult] = await Promise.all([
        supabase
        .from("profiles")
        .select("id, full_name")
        .eq("auth_user_id", user.id)
        .maybeSingle(),
        supabase
          .from("semesters")
          .select("id, name")
          .eq("is_active", true)
          .maybeSingle(),
      ]);
      const profile = profileResult.data;
      const activeSemester = semesterResult.data;
      if (profileResult.error || semesterResult.error || !profile || !activeSemester) {
        setSaveError(onboardingPreparationError(true));
        return;
      }
      setProfileId(profile.id);
      if (profile.full_name) setName(profile.full_name);
      setSemesterName(activeSemester.name);
      const { data: memberships, error: membershipError } = await supabase
        .from("semester_memberships")
        .select("id, semester_id, status, role, onboarding_data")
        .eq("profile_id", profile.id)
        .in("status", ["invited", "onboarding"])
      if (membershipError) {
        setSaveError(onboardingPreparationError(true));
        return;
      }
      const membership = selectActiveOnboardingMembership(
        (memberships ?? []).flatMap((candidate) => (
          (candidate.role === "mentor" || candidate.role === "startup")
            && (candidate.status === "invited" || candidate.status === "onboarding")
            ? [{ id: candidate.id, semesterId: candidate.semester_id, status: candidate.status, role: candidate.role }]
            : []
        )),
        activeSemester.id,
      );
      if (membership) {
        const base: OnboardingDraft = { role: membership.role, name: profile.full_name ?? "", organization: "", description: "", expertise: [], teamContact: "" };
        if (membership.role === "mentor") {
          const result = await supabase.from("mentor_profiles").select("company, biography, expertise_tags").eq("profile_id", profile.id).maybeSingle();
          if (result.error || !result.data) throw new Error("Your mentor profile could not be loaded. Refresh before continuing.");
          base.organization = result.data.company ?? "";
          base.description = result.data.biography ?? "";
          base.expertise = result.data.expertise_tags;
        } else {
          const team = await supabase.from("startup_team_memberships").select("startup_semester_id").eq("semester_id", membership.semesterId).eq("semester_membership_id", membership.id).maybeSingle();
          if (team.error || !team.data) throw new Error(startupAssignmentPreparationError());
          const startup = await supabase.from("startup_semesters").select("company_snapshot, mentor_need_context, startup_organization_id").eq("semester_id", membership.semesterId).eq("id", team.data.startup_semester_id).maybeSingle();
          if (startup.error || !startup.data) throw new Error("Your startup assignment exists, but its profile could not be loaded. Please try again. If this continues, an Almaworks admin needs to check startup onboarding access.");
          const organization = await supabase.from("startup_organizations").select("name").eq("id", startup.data.startup_organization_id).maybeSingle();
          if (organization.error || !organization.data) throw new Error(startupAssignmentPreparationError());
          base.organization = organization.data.name;
          base.description = startup.data.company_snapshot ?? "";
          base.teamContact = startup.data.mentor_need_context ?? "";
        }
        if (cancelled) return;
        const draft = restoreOnboardingDraft(base, memberships?.find(m => m.id === membership.id)?.onboarding_data);
        setName(draft.name);
        setOrganization(draft.organization);
        setDescription(draft.description);
        setExpertise(draft.expertise);
        setTeamContact(draft.teamContact);
        setAvailabilityChoice(draft.availabilityChoice);
        setStep(draft.step);
        setMembershipId(membership.id);
        setSemesterId(membership.semesterId);
        setRole(membership.role);
        setPrepared(true);
      } else throw new Error(onboardingPreparationError(true));
    }).catch((error: unknown) => {
      if (!cancelled) setSaveError(error instanceof Error ? error.message : "Your onboarding details could not be loaded. Please refresh.");
    });
    return () => { cancelled = true; };
  }, []);

  async function persistProgress(finalize = false) {
    if (saveInFlight.current || !prepared) return false;
    saveInFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!prepared || !user || !profileId || !membershipId || !semesterId) {
      setSaveError(onboardingPreparationError(user !== null));
      return false;
    }
    const writes = buildOnboardingWrites({ role, name, organization, description, expertise, teamContact, finalize });
    const profileUpdate = await supabase.from("profiles").update(writes.profile).eq("id", profileId);
    if (profileUpdate.error) {
      setSaveError(profileUpdate.error.message);
      setSaving(false);
      return false;
    }
    if (role === "mentor" && "mentorProfile" in writes && writes.mentorProfile && "mentorSemester" in writes && writes.mentorSemester) {
      const [profileResult, semesterResult, tagsResult] = await Promise.all([
        supabase.from("mentor_profiles").update(writes.mentorProfile).eq("profile_id", profileId),
        supabase.from("mentor_semesters").update(writes.mentorSemester).eq("semester_id", semesterId).eq("semester_membership_id", membershipId).select("id, readiness_status").maybeSingle(),
        authenticatedFetch("/api/expertise-tags/mentor", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: expertise }) }),
      ]);
      if (profileResult.error || semesterResult.error || !tagsResult.ok) {
        const tagsPayload = !tagsResult.ok ? await tagsResult.json() as { error?: string } : null;
        setSaveError(profileResult.error?.message ?? semesterResult.error?.message ?? tagsPayload?.error ?? "Mentor setup could not be saved.");
        setSaving(false);
        return false;
      }
      if (!isRoleSetupSaveConfirmed(semesterResult.data, finalize)) {
        setSaveError("Your mentor setup could not be confirmed. Please refresh and try again.");
        setSaving(false);
        return false;
      }
    }
    if (role === "startup" && "startupSemester" in writes && writes.startupSemester) {
      const teamResult = await supabase.from("startup_team_memberships").select("startup_semester_id").eq("semester_id", semesterId).eq("semester_membership_id", membershipId).maybeSingle();
      if (teamResult.error || !teamResult.data) {
        setSaveError(teamResult.error?.message ?? startupAssignmentPreparationError());
        setSaving(false);
        return false;
      }
      const startupResult = await supabase.from("startup_semesters").update(writes.startupSemester).eq("semester_id", semesterId).eq("id", teamResult.data.startup_semester_id).select("id, readiness_status").maybeSingle();
      if (startupResult.error) {
        setSaveError(startupResult.error.message);
        setSaving(false);
        return false;
      }
      if (!isRoleSetupSaveConfirmed(startupResult.data, finalize)) {
        setSaveError("Your startup setup could not be confirmed. Please refresh and try again.");
        setSaving(false);
        return false;
      }
    }
    const rows = [
      { item_key: "identity", is_required: true, completed_at: name.trim() && email.trim() ? new Date().toISOString() : null, payload: { name: name.trim(), email: email.trim(), role } },
      { item_key: role === "startup" ? "company_snapshot" : "mentor_profile", is_required: true, completed_at: organization.trim() && description.trim() ? new Date().toISOString() : null, payload: { organization: organization.trim(), description: description.trim() } },
      { item_key: role === "startup" ? "team_contacts" : "expertise", is_required: true, completed_at: (role === "startup" ? teamContact.trim() : expertise.length > 0) ? new Date().toISOString() : null, payload: role === "startup" ? { teamContact: teamContact.trim() } : { expertise } },
      ...(role === "mentor" ? [{ item_key: "mentoring_hours_setup", is_required: false, completed_at: null, payload: { choice: availabilityChoice } }] : []),
    ];
    const progressResult = await supabase.rpc("update_own_onboarding_progress", {
      p_membership_id: membershipId,
      p_semester_id: semesterId,
      p_onboarding_data: rows,
      p_finalize: finalize,
    });
    if (progressResult.error) {
      setSaveError(progressResult.error.message);
      setSaving(false);
      return false;
    }
    setSaving(false);
    return true;
    } catch {
      setSaveError("Your progress could not be saved. Check your connection and try again.");
      return false;
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  async function advance() {
    const ok = await persistProgress(step === 3);
    if (!ok) return;
    if (step === 3 && role === "mentor" && availabilityChoice === "set-hours-next") {
      router.push("/dashboard/mentor?tab=bookings&setup=availability");
      return;
    }
    setStep((current) => Math.min(4, current + 1) as WizardStep);
  }

  function goToDashboard() {
    router.push(role === "mentor" ? "/dashboard/mentor" : "/dashboard/startup");
  }

  const completedKeys = useMemo(() => {
    const completed = new Set<string>();
    if (step > 1 || (name.trim() && email.trim())) completed.add("identity");
    const roleDetailsComplete = role === "startup"
      ? organization.trim() && description.trim() && teamContact.trim()
      : organization.trim() && description.trim() && expertise.length > 0;
    if (step > 2 || roleDetailsComplete) {
      completed.add(role === "startup" ? "company_snapshot" : "mentor_profile");
      completed.add(role === "startup" ? "team_contacts" : "expertise");
    }
    return completed;
  }, [description, email, expertise, name, organization, role, step, teamContact]);
  const progress = calculateOnboardingProgress(role, completedKeys);
  const checklist = getOnboardingChecklist(role);

  async function returnToLogin() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOutParticipant(createClient(), (href) => {
        router.replace(href);
        router.refresh();
      });
    } catch {
      setSignOutError("We couldn’t sign you out. Please try again, or contact Layth below for help.");
      setSigningOut(false);
    }
  }

  if (!prepared) return <OnboardingPreparation error={saveError} onRetry={() => window.location.reload()} onReturnToLogin={() => void returnToLogin()} signingOut={signingOut} signOutError={signOutError} />;

  return (
    <div className={styles.shell}>
      <aside className={styles.contextPanel}>
        <div className={styles.contextBrand}><AlmaworksBrand tone="white" iconSize={34} /></div>
        <div className={styles.contextCopy}>
          <p className={styles.eyebrow}>{semesterName}</p>
          <h1>Let’s make your first session useful.</h1>
          <p>Three short steps give the program enough context to make thoughtful introductions. You can refine everything later.</p>
        </div>
        <ol className={styles.steps}>
          {[{ id: 1, icon: UserRound, label: "You" }, { id: 2, icon: role === "startup" ? Building2 : Sparkles, label: role === "startup" ? "Company" : "Expertise" }, { id: 3, icon: CheckCircle2, label: "Review" }].map(({ id, icon: Icon, label }) => (
            <li key={id} className={step === id ? styles.currentStep : step > id ? styles.finishedStep : ""}>
              <span>{step > id ? <Check size={14} /> : <Icon size={15} />}</span><div><small>Step {id}</small><strong>{label}</strong></div>
            </li>
          ))}
        </ol>
        <div className={styles.savedNote}><CheckCircle2 size={15} /><span>Your progress saves as you go.</span></div>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.formTop}>
          <span>{Math.min(step, 3)} of 3</span><div><i style={{ width: `${Math.min(step, 3) / 3 * 100}%` }} /></div><button type="button" onClick={() => void persistProgress()} disabled={saving || calendarConnecting}>{saving ? "Saving…" : "Save progress"}</button>
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
              <div className={styles.defaultNote}><Sparkles size={16} /><div><strong>Team access is collaborative by default</strong><p>Every active teammate can update this profile and contact details.</p></div></div>
            </section>
          )}

          {step === 2 && role === "mentor" && (
            <section>
              <p className={styles.eyebrow}>Share where you help best</p><h2>Shape your mentor profile</h2><p className={styles.lede}>Founders use this snapshot to understand your perspective before requesting time.</p>
              <label>Company or affiliation<input value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="Company, fund, or independent" /></label>
              <label>Short biography<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A concise introduction to your experience and mentoring style" rows={4} /><span className={styles.fieldMeta}>{description.length}/400</span></label>
                  <label>Expertise<ExpertiseTagPicker value={expertise} onChange={setExpertise} placeholder="Search or create an expertise tag…" /><span className={styles.hint}>Choose a topic or create a specific expertise tag. You can tune these after onboarding.</span></label>
            </section>
          )}

          {step === 3 && (
            <section>
              {semesterId && <CalendarConnectionCard key={semesterId} semesterId={semesterId} role={role} returnTo="onboarding" beforeConnect={() => persistProgress(false)} onConnectingChange={setCalendarConnecting} />}
              <p className={styles.eyebrow}>Ready to join</p><h2>Review how independent sessions work</h2><p className={styles.lede}>{role === "mentor" ? "Finishing setup activates your membership. Your mentoring hours stay unpublished until you set and save them." : "Your profile is ready. Independent mentor meetings are arranged after your membership becomes active."}</p>
              {role === "mentor" ? <>
                <fieldset className={styles.availabilityChoice}>
                  <legend>What would you like to do after setup?</legend>
                  <label className={availabilityChoice === "set-hours-next" ? styles.choiceSelected : ""}><input type="radio" name="availability-choice" value="set-hours-next" checked={availabilityChoice === "set-hours-next"} onChange={() => setAvailabilityChoice("set-hours-next")} /><span><strong>Set my mentoring hours next</strong><small>Recommended · We’ll walk you through the Bookings calendar.</small></span></label>
                  <label className={availabilityChoice === "add-later" ? styles.choiceSelected : ""}><input type="radio" name="availability-choice" value="add-later" checked={availabilityChoice === "add-later"} onChange={() => setAvailabilityChoice("add-later")} /><span><strong>Add mentoring hours later</strong><small>Finish now and open your dashboard. Startups cannot book you until you save mentoring hours.</small></span></label>
                </fieldset>
                <div className={styles.defaultNote}><Sparkles size={16} /><div><strong>Your mentoring hours control what startups can book</strong><p>Google Calendar only removes busy conflicts from the recurring hours you set. It does not create bookable hours for you.</p></div></div>
              </> : <div className={styles.defaultNote}><Sparkles size={16} /><div><strong>Browse program mentoring hours</strong><p>After activation, browse program availability and request a time. The meeting is confirmed only after the mentor accepts.</p></div></div>}
            </section>
          )}

          {step === 4 && (
            <section className={styles.completeState}>
              <span><Check size={28} /></span><p className={styles.eyebrow}>Essentials complete</p><h2>You’re ready for {semesterName}.</h2><p>We’ll take you to your dashboard. Optional details stay in a short checklist, so your profile can get stronger over time without blocking you today.</p>
              <div className={styles.summaryCard}><div><strong>{progress.required.completed}/{progress.required.total}</strong><small>Required tasks</small></div><div><strong>{role === "mentor" ? "Publish" : "Request"}</strong><small>In Bookings</small></div><div><strong>{role === "startup" ? "Shared" : "Personal"}</strong><small>Profile access</small></div></div>
              <div className={styles.nextChecklist}><strong>Keep improving when you have a minute</strong>{checklist.filter((item) => !item.required).map((item) => <span key={item.key}><i />{item.label}</span>)}</div>
              <button className={styles.primaryButton} disabled={saving || calendarConnecting} onClick={() => void goToDashboard()}>{saving ? "Finishing…" : "Go to my dashboard"} <ArrowRight size={16} /></button>
            </section>
          )}
        </div>

        {step < 4 && (
          <footer className={styles.footer}>
            <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1) as WizardStep)} disabled={step === 1 || saving || calendarConnecting}><ArrowLeft size={15} /> Back</button>
            <span>{step === 3 ? "Ready to finish" : "About 2 minutes remaining"}</span>
                <button type="button" className={styles.primaryButton} onClick={() => void advance()} disabled={saving || calendarConnecting || (step === 1 && (!name.trim() || !email.trim())) || (step === 2 && (!organization.trim() || !description.trim() || (role === "startup" ? !teamContact.trim() : expertise.length === 0)))}>{saving ? "Saving…" : step === 3 && role === "mentor" && availabilityChoice === "set-hours-next" ? "Finish setup & set hours" : step === 3 ? "Finish setup" : "Continue"}<ArrowRight size={15} /></button>
          </footer>
        )}
        {saveError && <p role="alert" className={styles.hint}>{saveError}</p>}
      </main>
    </div>
  );
}
