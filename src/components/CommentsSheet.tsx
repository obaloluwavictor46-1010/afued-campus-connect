import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Send } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar } from "./AppShell";
import { fetchProfiles, supabase, type Profile } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type C = { id: string; post_id: string; user_id: string; content: string; created_at: string };

export function CommentsSheet({ postId, onClose }: { postId: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<C[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [text, setText] = useState("");

  const load = async (id: string) => {
    const { data } = await supabase.from("comments").select("*").eq("post_id", id).order("created_at");
    setComments(data ?? []);
    setProfiles(await fetchProfiles((data ?? []).map((c) => c.user_id)));
  };

  useEffect(() => {
    if (!postId) return undefined;
    load(postId);
    const ch = supabase
      .channel(`comments-${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, () => load(postId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [postId]);

  const send = async () => {
    if (!text.trim() || !postId || !user) return;
    const { error } = await supabase.from("comments").insert({ post_id: postId, user_id: user.id, content: text.trim() });
    if (error) { toast.error(error.message); return; }
    setText("");
    load(postId);
  };

  return (
    <Sheet open={!!postId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto flex h-[80vh] max-w-xl flex-col rounded-t-3xl p-0">
        <SheetHeader className="border-b p-4"><SheetTitle>Comments</SheetTitle></SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {comments.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No comments yet. Be the first!</p>}
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar url={profiles[c.user_id]?.avatar_url} name={profiles[c.user_id]?.full_name} size={34} />
              <div className="rounded-2xl bg-muted px-3 py-2">
                <p className="text-sm font-semibold">{profiles[c.user_id]?.full_name || "Student"} <span className="ml-1 text-xs font-normal text-muted-foreground">{formatDistanceToNow(new Date(c.created_at))}</span></p>
                <p className="text-sm">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t p-3">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Add a comment…" className="flex-1 rounded-full border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button onClick={send} className="rounded-full bg-primary p-3 text-primary-foreground"><Send className="h-4 w-4" /></button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
