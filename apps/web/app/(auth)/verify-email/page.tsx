"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/layout/AuthCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, ApiError } from "@/lib/api";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("Missing verification token.");
      return;
    }

    api.auth
      .verifyEmail(token)
      .then(() => {
        router.replace("/dashboard/projects");
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Something went wrong. Please try again.");
        }
      });
  }, [router, searchParams]);

  return (
    <AuthCard title="Verifying your email" description="Incident Intelligence Platform">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground text-center">Verifying…</p>
      )}
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Verifying your email" description="Incident Intelligence Platform">
          <p className="text-sm text-muted-foreground text-center">Verifying…</p>
        </AuthCard>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
