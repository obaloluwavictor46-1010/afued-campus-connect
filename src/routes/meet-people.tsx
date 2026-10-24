import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, UserPlus, UserCheck, MessageCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/AppShell";
import { FEED_CHANNELS, supabase, shortFaculty, type Profile } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/meet-people")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Meet People — AFUED Community" }],
  }),
  component: MeetPeople,
});

function MeetPeople() {
  return <AppShell><MeetPeopleInner /></AppShell>;
}

function MeetPeopleInner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [facultyFilter, setFacultyFilter] = useState("All");
  const [myFollowing, setMyFollowing] = useState<Set<string>>(new Set());
  const [myFollowers, setMyFollowers] = useState<Set<string>>(new Set());
  const [followCounts, setFollowCounts] = useState<Record<string, { followers: number; following: number }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: profs } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(100);
    const list = (profs ?? []) as Profile[];
    setAllProfiles(list.filter((p) => p.id !== user?.id));

    const { data: follows } = await supabase.from("follows").select("follower_id, following_id");
    const counts: Record<string, { followers: number; following: number }> = {};
    (follows ?? []).forEach((f: any) => {
      if (!counts[f.following_id]) counts[f.following_id] = { followers: 0, following: 0 };
      if (!counts[f.follower_id]) counts[f.follower_id] = { followers: 0, following: 0 };
      counts[f.following_id].followers += 1;
      counts[f.follower_id].following += 1;
    });
    setFollowCounts(counts);

    if (user) {
      const mine = new Set<string>();
      const followersMine = new Set<string>();
      (follows ?? []).forEach((f: any) => {
        if (f.follower_id === user.id) mine.add(f.following_id);
        if (f.following_id === user.id) followersMine.add(f.follower_id);
      });
      setMyFollowing(mine);
      setMyFollowers(followersMine);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  // INSTANT FOLLOW - No request
  const toggleFollow = async (targetId: string) => {
    if (!user) { toast.error("Login first"); return; }
    if (busyId === targetId) return;
    setBusyId(targetId);
    const isFollowing = myFollowing.has(targetId);
    try {
      if (isFollowing) {
        const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetId);
        if (error) throw error;
        setMyFollowing((prev) => { const n = new Set(prev); n.delete(targetId); return n; });
        setFollowCounts((prev) => ({ ...prev, [targetId]: { followers: Math.max(0, (prev[targetId]?.followers || 1) - 1), following: prev[targetId]?.following || 0 } }));
        toast.success("Unfollowed");
      } else {
        const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: targetId });
        if (error) throw error;
        setMyFollowing((prev) => new Set(prev).add(targetId));
        setFollowCounts((prev) => ({ ...prev, [targetId]: { followers: (prev[targetId]?.followers || 0) + 1, following: prev[targetId]?.following || 0 } }));
        if (myFollowers.has(targetId)) toast.success("Follow Back done! 🎉 You fit message am now");
        else toast.success("Followed! ✅");
      }
    } catch (e: any) {
      toast.error(e.message || "Follow failed");
    } finally { setBusyId(null); }
  };

  // FIXED: No more /messages, no more ?user= -> No more 404
  const handleMessage = (targetId: string) => {
    if (!myFollowing.has(targetId)) {
      toast.error("Follow am first before you fit message am");
      return;
    }
    localStorage.setItem("afued-chat-with", targetId);
    navigate({ to: "/chat" as any });
  };

  const filtered = allProfiles.filter((p) => {
    const matchSearch = (p.full_name || "").toLowerCase().includes(search.toLowerCase());
    const matchFaculty = facultyFilter === "All" || p.faculty === facultyFilter;
    return matchSearch && matchFaculty;
  });

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Users className="h-6 w-6 text-primary" /> Meet People</h1>
        <p className="text-sm text-muted-foreground">Find AFUED students, follow instantly, message only people you follow.</p>
      </div>

      <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name..." className="flex-1 bg-transparent text-sm outline-none" />
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {["All", ...FEED_CHANNELS].map((f) => (
          <button key={f} onClick={() => setFacultyFilter(f)} className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold ${facultyFilter === f ? "bg-primary text-white" : "bg-muted"}`}>
            {f === "All" ? "All" : shortFaculty(f)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-muted-foreground">Loading people...</p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">No people found for this filter.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const isFollowing = myFollowing.has(p.id);
            const followsYou = myFollowers.has(p.id);
            const c = followCounts[p.id] || { followers: 0, following: 0 };
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-card">
                {/* FIXED: No more Link to /u/$userId - that route no exist, na why e dey 404. Now na just div, no 404 */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar url={p.avatar_url} name={p.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.full_name || "AFUED Student"}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.faculty ? shortFaculty(p.faculty) : "AFUED"}</p>
                    <p className="text-[11px] text-muted-foreground">{c.followers} followers • {c.following} following</p>
                    {followsYou && !isFollowing && <span className="text-[11px] font-bold text-green-600">Follows you • Follow Back</span>}
                    {followsYou && isFollowing && <span className="text-[11px] font-bold text-green-600">You follow each other ✓</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button onClick={() => toggleFollow(p.id)} disabled={busyId === p.id} className={`flex items-center gap-1 rounded-full px-4 py-2 text-xs font-bold ${isFollowing ? "border border-green-200 bg-green-100 text-green-700" : "bg-primary text-white"}`}>
                    {isFollowing ? <><UserCheck className="h-4 w-4" /> Following</> : <><UserPlus className="h-4 w-4" /> {followsYou ? "Follow Back" : "Follow"}</>}
                  </button>
                  {isFollowing && (
                    <button onClick={() => handleMessage(p.id)} className="flex items-center justify-center gap-1 rounded-full bg-muted px-4 py-2 text-xs font-bold">
                      <MessageCircle className="h-4 w-4" /> Message
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
