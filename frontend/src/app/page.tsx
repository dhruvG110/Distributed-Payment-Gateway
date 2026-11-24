
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 font-sans">
      <h1 className="text-center text-white text-6xl font-bold">
        PayMesh
      </h1>

      <Link
        href="/auth/login"
        className="mt-8 text-center text-white text-2xl cursor-pointer hover:text-zinc-400"
      >
        Login
      </Link>
    </div>
  );
}
