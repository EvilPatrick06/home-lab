import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';

function projectUser(rawUser) {
  if (!rawUser) return null;
  const meta = rawUser.user_metadata || {};
  return {
    id: rawUser.id,
    githubLogin: meta.user_name || meta.preferred_username || null,
    avatarUrl: meta.avatar_url || null,
  };
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured());

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(projectUser(data.session?.user));
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(projectUser(session?.user));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
