import { AyuLost } from "../components/PageArt";
import { Shell } from "../components/Shell";
import { Arrow, Button } from "../components/ui";

export default function NotFound() {
  return (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-32 text-center">
        <AyuLost className="mx-auto mb-4 w-28" />
        <div className="eyebrow">404</div>
        <h1 className="mt-4 font-display text-[64px] leading-none">Nothing here.</h1>
        <p className="mt-4 text-[15px] text-muted">Even Ayu floated off this one. The ward is one click away.</p>
        <div className="mt-8"><Button to="/doctor">Open the ward <Arrow /></Button></div>
      </div>
    </Shell>
  );
}
