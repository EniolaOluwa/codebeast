import "./home.css";

import { Atkinson_Hyperlegible_Mono, Host_Grotesk } from "next/font/google";
import Link from "next/link";

import { HomeConfirm } from "@/components/home/home-confirm";
import { HomeField } from "@/components/home/home-field";
import { HomeGate } from "@/components/home/home-gate";
import { HomePipeline } from "@/components/home/home-pipeline";
import { HomeReveal } from "@/components/home/home-reveal";
import { HomeStages } from "@/components/home/home-stages";

const hostGrotesk = Host_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-home-display",
  display: "swap",
});

const atkinsonMono = Atkinson_Hyperlegible_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-home-mono",
  display: "swap",
});

export default function Home() {
  return (
    <div className={`home ${hostGrotesk.variable} ${atkinsonMono.variable}`}>
      <HomeField />

      <div className="home-content">
        <header className="home-container home-nav">
          <span className="home-mark">CodeBeast</span>
          <nav className="home-nav-actions">
            <Link href="/login" className="home-btn home-btn--primary">
              Open the console
            </Link>
          </nav>
        </header>

        <main>
          <HomeReveal>
            <h1>Bugs find you. Fixes follow.</h1>
            <p className="home-lede">
              CodeBeast watches Sentry and your support channels, turns the
              noise into one report, and prepares a pull request you confirm.
            </p>
            <div className="home-hero-cta">
              <Link href="/login" className="home-btn home-btn--primary">
                Open the console
              </Link>
            </div>
            <HomePipeline />
          </HomeReveal>

          <section className="home-section">
            <div className="home-container">
              <h2>How CodeBeast turns bugs into pull requests</h2>
              <HomeStages />
            </div>
          </section>

          <section className="home-section home-section--band">
            <div className="home-container home-split">
              <div>
                <h2>Nothing ships on its own</h2>
                <p className="home-split-lede">
                  Confirm the write yourself. CodeBeast never deploys or merges.
                  The ticket and pull request stay closed until you say so.
                </p>
              </div>
              <HomeGate />
            </div>
          </section>

          <section className="home-section">
            <div className="home-container home-split home-split--flip">
              <div>
                <h2>See the evidence before anything is written</h2>
                <p className="home-split-lede">
                  The original error stays beside the draft ticket and pull
                  request, so you can check the claim before Jira or GitHub
                  change.
                </p>
              </div>
              <HomeConfirm />
            </div>
          </section>

          <section className="home-section">
            <div className="home-container home-close">
              <h2>Start with your own Sentry or Slack errors</h2>
              <p>
                Connect a source and the first triaged report appears in the
                console within minutes.
              </p>
              <Link href="/login" className="home-btn home-btn--primary">
                Open the console
              </Link>
            </div>
          </section>
        </main>

        <footer className="home-footer">
          <div className="home-container home-footer-grid">
            <div className="home-footer-brand">
              <p className="home-mark">CodeBeast</p>
              <p className="home-footer-blurb">
                Autonomous SRE that turns Sentry errors and support tickets into
                triaged reports and pull requests you confirm.
              </p>
              <Link href="/login" className="home-btn home-btn--primary">
                Open the console
              </Link>
            </div>

            <div className="home-footer-col">
              <p className="home-stage-label">Product</p>
              <ul className="home-footer-links">
                <li>
                  <Link href="/login" className="home-link">
                    Console
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="home-link">
                    Create an account
                  </Link>
                </li>
              </ul>
            </div>

            <div className="home-footer-col">
              <p className="home-stage-label">Sources</p>
              <ul className="home-footer-links">
                <li>Sentry</li>
                <li>Slack</li>
                <li>Discord</li>
                <li>Freshdesk</li>
              </ul>
            </div>

            <div className="home-footer-col">
              <p className="home-stage-label">Safe by design</p>
              <ul className="home-footer-links">
                <li>
                  Never deploys or merges: every fix arrives as a pull request
                  ready for review.
                </li>
                <li>
                  Writes to Jira and GitHub happen only after you confirm,
                  unless a rule says otherwise.
                </li>
                <li>
                  Every AI conclusion links back to the original error or
                  message.
                </li>
                <li>
                  Low confidence or protected files escalate to a human instead
                  of guessing.
                </li>
              </ul>
            </div>
          </div>

          <div className="home-container home-footer-bar">
            <span>© CodeBeast</span>
            <span>Every fix ships as a pull request.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
