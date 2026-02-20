import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Sparkles } from "lucide-react";

export const Hero = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const isValidEmail = (e: string) => /\S+@\S+\.\S+/.test(e);

  const handleJoin = async () => {
    if (!isValidEmail(email)) {
      setMessage("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setMessage("");
    
    try {
      const emailTrimmed = email.toLowerCase().trim();
      console.log('[Waitlist] Attempting to save email:', emailTrimmed);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const apiResponse = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTrimmed }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (apiResponse.ok) {
        console.log('[Waitlist] Email saved via API');
        setMessage("Thanks for joining! Check your email for updates.");
        setEmail("");
        setTimeout(() => setMessage(""), 5000);
        return;
      } else {
        const errorData = await apiResponse.json().catch(() => ({}));
        setMessage(errorData.message || "Failed to join waitlist. Please try again.");
      }
    } catch (err: any) {
      console.error('[Waitlist] Error:', err);
      const errorMsg = err?.message || 'Unexpected error. Please try again.';
      setMessage(`Error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading && isValidEmail(email)) {
      handleJoin();
    }
  };

  return (
    <section className="bg-white pt-28 pb-16 md:pt-32 md:pb-24">
      <div className="max-w-[1800px] mx-auto px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-secondary/10 border border-secondary/20 px-4 py-2 text-sm font-light text-secondary">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI-Powered Workforce Intelligence</span>
          </div>
          
          <h1 className="mb-6 text-5xl font-light tracking-tight text-gray-900 md:text-6xl">
            Focus on What
            <span className="block font-light text-primary">
              Actually Matters
            </span>
          </h1>
          
          <p className="mx-auto mb-12 max-w-2xl text-base leading-relaxed text-gray-600 font-light">
            Eliminate redundant operational work with AI-powered scheduling and workforce optimization. 
            <span className="text-gray-700"> Let your managers drive outcomes, not logistics.</span>
          </p>
          
          {/* Action Area */}
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row max-w-lg mx-auto p-1.5 rounded-xl bg-white border border-gray-200 shadow-sm">
            <Input
              type="email"
              placeholder="Enter your work email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
              className="h-11 border-none bg-transparent text-sm font-light focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:font-light"
            />
            <Button
              aria-label="Join the waitlist"
              onClick={handleJoin}
              disabled={loading || !isValidEmail(email)}
              className="h-11 px-6 gap-2 bg-primary hover:bg-primary/90 text-white font-light rounded-lg flex-shrink-0"
            >
              {loading ? "Joining..." : "Join"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
          
          {/* Status Message */}
          {message && (
            <p className={`mt-4 text-sm font-light ${message.includes("Failed") || message.includes("Unexpected") ? "text-destructive" : "text-emerald-600"}`}>
              {message}
            </p>
          )}
          
          {/* Trust Section */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-xs font-light text-gray-500">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-emerald-500" />
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-emerald-500" />
              14-day free trial
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-emerald-500" />
              Enterprise ready
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};