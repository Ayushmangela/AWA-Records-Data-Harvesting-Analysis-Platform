import React, { createContext, useContext, useEffect, useReducer } from "react";
import supabase from "../lib/supabase";

const AuthContext = createContext(null);

const initialState = {
  user: null,
  session: null,
  loading: true,
};

function authReducer(state, action) {
  switch (action.type) {
    case "SET_SESSION":
      return {
        ...state,
        session: action.payload,
        user: action.payload?.user ?? null,
        loading: false,
      };
    case "CLEAR_SESSION":
      return {
        ...state,
        session: null,
        user: null,
        loading: false,
      };
    case "SET_LOADING":
      return {
        ...state,
        loading: action.payload,
      };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    // Restore existing session on mount
    async function restoreSession() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        dispatch({ type: "SET_SESSION", payload: session });
      } catch (error) {
        console.error("Error restoring session:", error.message);
        dispatch({ type: "CLEAR_SESSION" });
      }
    }

    restoreSession();

    // Subscribe to authentication state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        dispatch({ type: "SET_SESSION", payload: session });
      } else {
        dispatch({ type: "CLEAR_SESSION" });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function login(email, password) {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      dispatch({ type: "SET_SESSION", payload: data.session });
      return data;
    } catch (error) {
      dispatch({ type: "SET_LOADING", payload: false });
      throw error;
    }
  }

  async function signup(email, password, fullName) {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });
      if (error) throw error;
      // Note: If email confirmation is enabled, session might be null.
      // If it is auto-confirmed, data.session will be populated.
      if (data.session) {
        dispatch({ type: "SET_SESSION", payload: data.session });
      } else {
        dispatch({ type: "SET_LOADING", payload: false });
      }
      return data;
    } catch (error) {
      dispatch({ type: "SET_LOADING", payload: false });
      throw error;
    }
  }

  async function logout() {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      dispatch({ type: "CLEAR_SESSION" });
    } catch (error) {
      dispatch({ type: "SET_LOADING", payload: false });
      throw error;
    }
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
