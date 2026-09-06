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

import { AlmaworksBrand } from "@/components/AlmaworksBrand";
import { ExpertiseTagPicker } from "@/components/ExpertiseTagPicker";
import { buildOnboardingWrites, calculateOnboardingProgress, getOnboardingChecklist, isRoleSetupSaveConfirmed, onboardingPreparationError, selectActiveOnboardingMembership, startupAssignmentPreparationError } from "@/src/lifecycle/onboarding";
import type { ProgramRole } from "@/src/lifecycle/types";
import { createClient } from "@/utils/supabase/client";

import styles from "./onboarding-flow.module.css";

type ParticipantRole = Extract<ProgramRole, "startup" | "mentor">;
type WizardStep = 1 | 2 | 3 | 4;

type MeetingWindow = { id: string; meetingId: string; slot: number; day: string; date: string; time: string };

export default function OnboardingFlow() {
  const [role, setRole] = useState<ParticipantRole>("startup");
  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [description, setDescription] = useState("");
  const [expertise, setExpertise] = useState<string[]>(["Product strategy", "Go-to-market"]);
  const [teamContact, setTeamContact] = useState("");
  const [meetingWindows, setMeetingWindows] = useState<MeetingWindow[]>([]);
  const [selectedWindows, setSelectedWindows] = useState<Set<string>>(new Set());
  const [semesterName, setSemesterName] = useState("your semester");
  const [profileId, setProfileId] = useState<string | null>(null);
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
        .select("id, semester_id, status, role")
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
        setMembershipId(membership.id);
        setSemesterId(membership.semesterId);
        setRole(membership.role);
        const [{ data: meetings }, { data: availability }] = await Promise.all([
          supabase.from("meetings").select("id, meeting_date, slot_1_starts_at, slot_1_ends_at, slot_2_starts_at, slot_2_ends_at").eq("semester_id", membership.semesterId).order("meeting_date"),
          supabase.from("meeting_availability").select("meeting_id, slot, is_available").eq("semester_membership_id", membership.id),
        ]);
        const windows = (meetings ?? []).flatMap((meeting) => ([1, 2] as const).map((slot) => {
          const date = new Date(`${meeting.meeting_date}T12:00:00`);
          const start = slot === 1 ? meeting.slot_1_starts_at : meeting.slot_2_starts_at;
          const end = slot === 1 ? meeting.slot_1_ends_at : meeting.slot_2_ends_at;
          return { id: `${meeting.id}:${slot}`, meetingId: meeting.id, slot, day: date.toLocaleDateString(undefined, { weekday: "long" }), date: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), time: `${start.slice(0, 5)} – ${end.slice(0, 5)}` };
        }));
        setMeetingWindows(windows);
        const saved = new Set((availability ?? []).filter((item) => item.is_available).map((item) => `${item.meeting_id}:${item.slot}`));
        setSelectedWindows(saved.size > 0 ? saved : new Set(windows.map((window) => window.id)));
      }
    });
  }, []);

  async function persistProgress(finalize = false) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !profileId || !membershipId || !semesterId) {
      setSaveError(onboardingPreparationError(user !== null));
      return false;
    }
    setSaving(true);
    setSaveError(null);
    const writes = buildOnboardingWrites({ role, name, organization, description, expertise, teamContact, finalize });
    const profileUpdate = await supabase.from("profiles").update(writes.profile).eq("id", profileId);
    if (profileUpdate.error) {
      setSaveError(profileUpdate.error.message);
      setSaving(false);
      return false;
    }
    if (role === "mentor" && "mentorProfile" in writes && writes.mentorProfile && "mentorSemester" in writes && writes.mentorSemester) {
      const [profileResult, semesterResult] = await Promise.all([
        supabase.from("mentor_profiles").update(writes.mentorProfile).eq("profile_id", profileId),
        supabase.from("mentor_semesters").update(writes.mentorSemester).eq("semester_id", semesterId).eq("semester_membership_id", membershipId).select("id, readiness_status").maybeSingle(),
      ]);
      if (profileResult.error || semesterResult.error) {
        setSaveError(profileResult.error?.message ?? semesterResult.error?.message ?? "Mentor setup could not be saved.");
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
      { item_key: "availability", is_required: true, completed_at: selectedWindows.size > 0 ? new Date().toISOString() : null, payload: { windows: Array.from(selectedWindows) } },
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
    if (finalize && selectedWindows.size > 0) {
      const availability = meetingWindows.map((window) => ({ semester_id: semesterId, semester_membership_id: membershipId, meeting_id: window.meetingId, slot: window.slot, is_available: selectedWindows.has(window.id), source: "onboarding" }));
      const availabilityResult = await supabase.from("meeting_availability").delete().eq("semester_id", semesterId).eq("semester_membership_id", membershipId);
      if (availabilityResult.error) { setSaveError(availabilityResult.error.message); setSaving(false); return false; }
      const insertResult = await supabase.from("meeting_availability").insert(availability);
      if (insertResult.error) { setSaveError(insertResult.error.message); setSaving(false); return false; }
    }
    setSaving(false);
    return true;
  }

  async function advance() {
    const ok = await persistProgress(step === 3);
    if (ok) setStep((current) => Math.min(4, current + 1) as WizardStep);
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
        <div className={styles.contextBrand}><AlmaworksBrand tone="white" iconSize={34} /></div>
        <div className={styles.contextCopy}>
          <p className={styles.eyebrow}>{semesterName}</p>
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
                  <label>Expertise<ExpertiseTagPicker value={expertise} onChange={setExpertise} placeholder="Search or create an expertise tag…" /><span className={styles.hint}>Choose a topic or create a specific expertise tag. You can tune these after onboarding.</span></label>
            </section>
          )}

          {step === 3 && (
            <section>
              <p className={styles.eyebrow}>One last essential</p><h2>When are you usually free?</h2><p className={styles.lede}>We selected the program’s recommended windows. Deselect anything that doesn’t work; exact meeting times are confirmed later.</p>
              <div className={styles.windowList}>
                {meetingWindows.map((window) => {
                  const selected = selectedWindows.has(window.id);
                  return <button type="button" key={window.id} className={selected ? styles.windowSelected : ""} onClick={() => toggleWindow(window.id)}><span className={styles.checkBox}>{selected && <Check size={13} />}</span><span className={styles.dateBlock}><strong>{window.day}</strong><small>{window.date}</small></span><span className={styles.timeBlock}><Clock3 size={15} />{window.time}</span><span className={styles.recommended}>{window.slot === 1 ? "Session 1" : "Session 2"}</span></button>;
                })}
              </div>
              <div className={styles.defaultNote}><Sparkles size={16} /><div><strong>Defaults, not commitments</strong><p>These windows improve matching. You’ll approve each session request before it is scheduled.</p></div></div>
            </section>
          )}

          {step === 4 && (
            <section className={styles.completeState}>
              <span><Check size={28} /></span><p className={styles.eyebrow}>Essentials complete</p><h2>You’re ready for {semesterName}.</h2><p>We’ll take you to your dashboard. Optional details stay in a short checklist, so your profile can get stronger over time without blocking you today.</p>
              <div className={styles.summaryCard}><div><strong>{progress.required.completed}/{progress.required.total}</strong><small>Required tasks</small></div><div><strong>{selectedWindows.size}</strong><small>Available windows</small></div><div><strong>{role === "startup" ? "Shared" : "Personal"}</strong><small>Profile access</small></div></div>
              <div className={styles.nextChecklist}><strong>Keep improving when you have a minute</strong>{checklist.filter((item) => !item.required).map((item) => <span key={item.key}><i />{item.label}</span>)}</div>
              <button className={styles.primaryButton} disabled={saving} onClick={() => void goToDashboard()}>{saving ? "Finishing…" : "Go to my dashboard"} <ArrowRight size={16} /></button>
            </section>
          )}
        </div>

        {step < 4 && (
          <footer className={styles.footer}>
            <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1) as WizardStep)} disabled={step === 1}><ArrowLeft size={15} /> Back</button>
            <span>{step === 3 ? `${selectedWindows.size} windows selected` : "About 2 minutes remaining"}</span>
                <button type="button" className={styles.primaryButton} onClick={() => void advance()} disabled={saving || (step === 1 && (!name.trim() || !email.trim())) || (step === 2 && (!organization.trim() || !description.trim() || (role === "startup" ? !teamContact.trim() : expertise.length === 0))) || (step === 3 && selectedWindows.size === 0)}>{saving ? "Saving…" : step === 3 ? "Finish setup" : "Continue"}<ArrowRight size={15} /></button>
          </footer>
        )}
        {saveError && <p role="alert" className={styles.hint}>{saveError}</p>}
      </main>
    </div>
  );
}
