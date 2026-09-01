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
import { buildOnboardingWrites, calculateOnboardingProgress, getOnboardingChecklist } from "@/src/lifecycle/onboarding";
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
  const [expertise, setExpertise] = useState("Product strategy, Go-to-market");
  const [teamContact, setTeamContact] = useState("");
  const [meetingWindows, setMeetingWindows] = useState<MeetingWindow[]>([]);
  const [selectedWindows, setSelectedWindows] = useState<Set<string>>(new Set());
  const [semesterName, setSemesterName] = useState("your semester");
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
        const [{ data: semester }, { data: meetings }, { data: availability }] = await Promise.all([
          supabase.from("semesters").select("name").eq("id", membership.semester_id).maybeSingle(),
          supabase.from("meetings").select("id, meeting_date, slot_1_starts_at, slot_1_ends_at, slot_2_starts_at, slot_2_ends_at").eq("semester_id", membership.semester_id).order("meeting_date"),
          supabase.from("meeting_availability").select("meeting_id, slot, is_available").eq("semester_membership_id", membership.id),
        ]);
        if (semester?.name) setSemesterName(semester.name);
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
    if (!user || !membershipId || !semesterId) {
      setSaveError("Your invitation is still being prepared. Please refresh and try again.");
      return false;
    }
    setSaving(true);
    setSaveError(null);
    const writes = buildOnboardingWrites({ role, name, organization, description, expertise, teamContact, finalize });
    const profileUpdate = await supabase.from("profiles").update(writes.profile).eq("id", user.id);
    if (profileUpdate.error) {
      setSaveError(profileUpdate.error.message);
      setSaving(false);
      return false;
    }
    if (role === "mentor" && "mentorProfile" in writes && writes.mentorProfile && "mentorSemester" in writes && writes.mentorSemester) {
      const [profileResult, semesterResult] = await Promise.all([
        supabase.from("mentor_profiles").update(writes.mentorProfile).eq("profile_id", user.id),
        supabase.from("mentor_semesters").update(writes.mentorSemester).eq("semester_id", semesterId).eq("semester_membership_id", membershipId),
      ]);
      if (profileResult.error || semesterResult.error) {
        setSaveError(profileResult.error?.message ?? semesterResult.error?.message ?? "Mentor setup could not be saved.");
        setSaving(false);
        return false;
      }
    }
    if (role === "startup" && "startupSemester" in writes && writes.startupSemester) {
      const teamResult = await supabase.from("startup_team_memberships").select("startup_semester_id").eq("semester_id", semesterId).eq("semester_membership_id", membershipId).maybeSingle();
      if (teamResult.error || !teamResult.data) {
        setSaveError(teamResult.error?.message ?? "Your startup team assignment is still being prepared.");
        setSaving(false);
        return false;
      }
      const startupResult = await supabase.from("startup_semesters").update(writes.startupSemester).eq("semester_id", semesterId).eq("id", teamResult.data.startup_semester_id);
      if (startupResult.error) {
        setSaveError(startupResult.error.message);
        setSaving(false);
        return false;
      }
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
        <div className={styles.contextBrand}><AlmaworksBrand tone="white" iconSize={34} /></div>
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
              <span><Check size={28} /></span><p className={styles.eyebrow}>Essentials complete</p><h2>Your setup is ready for {semesterName}.</h2><p>Your information is saved. Almaworks will activate your semester membership; your dashboard will show the current status while you wait.</p>
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
