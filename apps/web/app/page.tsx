export default function Home() {
  return (
    <main>
      <section className="hero">
        <h1>CodeBeast</h1>
        <p className="tagline">
          Your autonomous SRE platform. CodeBeast turns customer support tickets
          and Sentry errors into validated pull requests.
        </p>
      </section>

      <section>
        <h2>How it works</h2>
        <ol className="steps">
          <li>
            <h3>Triage</h3>
            <p>
              Correlates Sentry errors and customer tickets into a single
              triaged issue.
            </p>
          </li>
          <li>
            <h3>Plan &amp; patch</h3>
            <p>
              An AI engineer traces the root cause and writes the smallest
              correct change.
            </p>
          </li>
          <li>
            <h3>Validate &amp; open a PR</h3>
            <p>
              Tests, lint, and type-check gate the patch in an isolated sandbox
              — then it opens a reviewable pull request.
            </p>
          </li>
        </ol>
      </section>

      <section>
        <h2>Safe by design</h2>
        <ul className="guarantees">
          <li>
            Never deploys or merges — every fix arrives as a pull request.
          </li>
          <li>Every patch is validated before a human ever sees it.</li>
          <li>
            Low confidence or protected files escalate to a human instead of
            guessing.
          </li>
        </ul>
      </section>

      <footer>
        <p>© CodeBeast</p>
      </footer>
    </main>
  );
}
