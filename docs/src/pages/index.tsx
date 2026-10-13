import Head from "@docusaurus/Head";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";

import { Copy, Ghost, Hero, Icon, Pic } from "../components/Landing";

const ACTS = [
  {
    when: "past",
    ghost: "The Ghost Of Money Past",
    title: "How It Has Grown",
    text: "Your net worth over time against every rupee you put in. The gap between the two lines is what the market did for you, or to you.",
    facts: [
      ["show_chart", "Net worth, priced every evening"],
      ["event", "Money in, dated to the day"],
      ["hourglass_top", "No yearly rate before 90 days"],
    ],
    shots: [["today-past", "Net worth over time, set against every rupee put in."]],
  },
  {
    when: "present",
    ghost: "The Ghost Of Money Present",
    title: "Where It Stands",
    text: "Everything you own, priced from the exchanges' own files, and each part set against the same money in your index. Red is what your choices cost.",
    facts: [
      ["account_balance", "Shares, funds, bonds, gold and sections of your own"],
      ["compare_arrows", "Against your index, on the same days"],
      ["lock", "Statements read in your browser, never uploaded"],
    ],
    shots: [
      ["money-sits", "Where the money sits: each section's share of net worth."],
      ["against-index", "Each section's yearly return, ahead of or behind the same money in the Nifty 50."],
    ],
  },
  {
    when: "future",
    ghost: "The Ghost Of Money Yet To Come",
    title: "Where It Is Heading",
    text: "If nothing new goes in: at your own rate, at inflation, and what today's money will buy then. I point; I do not predict.",
    facts: [
      ["trending_up", "At the rate you have actually earned"],
      ["price_change", "At inflation, just keeping up"],
      ["shopping_bag", "What today's rupee buys in 20 years"],
    ],
    shots: [["today-future", "Net worth in 5, 10 and 20 years, at your own rate and at inflation."]],
  },
] as const;

const DAILY = [
  { title: "My Note", text: "What changed, what is carrying you, what is not.", shot: "note-phone", alt: "My note on Today: a verdict, then the points behind it." },
  { title: "Signal Or Humbug", text: "Every story about what you hold, judged in one line.", shot: "news-phone", alt: "News about your holdings, each marked signal or humbug with a reason." },
  { title: "Ask Me", text: "Answers from your own books, and what to ask next.", shot: "ask-phone", alt: "A question answered from your own ledger, with questions to ask next." },
];

const SPEND = [
  { title: "Say It", text: "“₹450 on lunch” is enough. I do the filing.", shot: "spend-chat-phone", alt: "Telling the chat about ₹450 on lunch, and picking how it was paid." },
  { title: "Habits", text: "Which small spends add up, and which big ones are rare.", shot: "trends-phone", alt: "Spending categories sorted by how often and how much." },
  { title: "Cards", text: "Every statement, every due date, and what is billed.", shot: "cards-phone", alt: "A credit card with its statement, due date and what is billed." },
];

const MORE = [
  ["payments", "No Data Bill", "Exchange and AMFI prices, free every evening."],
  ["monitor_heart", "I Watch My Sources", "Two failures in a row and you hear from me."],
  ["mail", "A Morning Report", "Net worth, my note and the news, by mail."],
  ["tune", "To Your Taste", "Pick my personality and tone, or write your own."],
  ["group", "For The Family", "Share a portfolio with the people you keep books with."],
  ["key", "Keys Kept Locked", "AI, mail and alert passwords encrypted at rest."],
];

function Tiles({ label, items }: { label: string; items: { title: string; text: string; shot: string; alt: string }[] }) {
  return (
    // On a phone the row scrolls sideways, so it takes keyboard focus to be scrolled with arrow keys.
    <ul className="ptiles swipe" role="list" aria-label={label} tabIndex={0}>
      {items.map((t) => (
        <li key={t.title} className="ptile">
          <h3>{t.title}</h3>
          <p>{t.text}</p>
          <div className="pimg">
            <Pic name={t.shot} alt={t.alt} phone={false} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Ebenezer",
  url: "https://ebenezer.dimwit.me/",
  description:
    "A self-hosted ledger for everything an Indian investor owns. It prices holdings each evening from free exchange and AMFI data, works out XIRR against the Nifty 50, judges the news and keeps your expenses and credit cards.",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Linux, macOS, Windows (Docker)",
  image: "https://ebenezer.dimwit.me/img/og.png",
  screenshot: "https://ebenezer.dimwit.me/img/shots/today-light.webp",
  license: "https://opensource.org/licenses/MIT",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
  author: { "@type": "Organization", name: "Dimwit Labs", url: "https://dimwit.me" },
  sameAs: ["https://github.com/DimwitLabs/Ebenezer"],
};

export default function Home() {
  return (
    <Layout description="I keep a ledger of everything you own, on your own server, and I tell you plainly how it is doing.">
      <Head>
        <title>Ebenezer: A Self-Hosted Ledger For Everything You Own</title>
        <meta property="og:title" content="Ebenezer: A Self-Hosted Ledger For Everything You Own" />
        <script type="application/ld+json">{JSON.stringify(LD)}</script>
      </Head>
      <main className="eb">
        <section className="phero">
          <h1>Bah, Humbug!</h1>
          <p className="plede">I Am Ebenezer. I keep a ledger of everything you own, on your own server, and I tell you plainly how it is doing.</p>
          <div className="ctas">
            <a className="btn" href="#run">
              <Icon name="dns" />
              Run me
            </a>
            <Link className="btn tonal" to="/docs">
              <Icon name="menu_book" />
              Read the docs
            </Link>
          </div>
          <div className="pshot">
            <Hero alt="Today: net worth, what it is made of, and my note." />
          </div>
        </section>

        <div className="verdict">
          <span className="vkick">Plainly</span>
          <p>
            Your money earned <b className="up">9.4%</b> a year. The same rupees in the Nifty 50 earned <b className="down">13.8%</b>.
          </p>
          <small>Every dated rupee counted, against the same money on the same days. Usually the index wins. I will say so.</small>
        </div>

        <div className="pname">
          <span className="vkick">About The Name</span>
          <p>
            Ebenezer Scrooge kept the books, counted every coin, and thought most of what people spent money on was humbug. Then three ghosts kept him up all night, showing him his past, his present
            and his likely future. He came out of it better with his money and with his people.
          </p>
          <p className="punch">I have kept the ledger and the ghosts. The miserliness I now practise on your behalf.</p>
        </div>

        <div className="phead">
          <span className="ghosts">
            <Ghost when="past" />
            <Ghost when="present" />
            <Ghost when="future" />
          </span>
          <h2>Past, Present And Future</h2>
          <p>My three ghosts, put to work on your money.</p>
        </div>
        <ul className="acts swipe" role="list" aria-label="Past, present and future" tabIndex={0}>
          {ACTS.map((a, i) => (
            <li key={a.when} className={`act act-${a.when}${i % 2 ? " flip" : ""}`}>
              <div className="acopy">
                <span className="aghost">
                  <Ghost when={a.when} />
                  {a.ghost}
                </span>
                <h3>{a.title}</h3>
                <p>{a.text}</p>
                <ul>
                  {a.facts.map(([icon, fact]) => (
                    <li key={fact}>
                      <Icon name={icon} />
                      {fact}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="ashot">
                {a.shots.map(([shot, alt]) => (
                  <Pic key={shot} name={shot} alt={alt} />
                ))}
              </div>
            </li>
          ))}
        </ul>

        <section className="pband">
          <div className="phead">
            <h2>Every Morning, A Word</h2>
            <p>I read the news before you wake, and I answer what you ask from your own books.</p>
          </div>
          <Tiles label="Every morning" items={DAILY} />
        </section>

        <section className="pband">
          <div className="phead">
            <h2>And Your Spending</h2>
            <p>A side job, kept properly.</p>
          </div>
          <Tiles label="Your spending" items={SPEND} />
        </section>

        <section className="pband">
          <div className="phead">
            <h2>…More?</h2>
          </div>
          <ul className="pmore swipe" role="list" aria-label="More" tabIndex={0}>
            {MORE.map(([icon, title, text]) => (
              <li key={title}>
                <span className="item-i ms" aria-hidden="true">
                  {icon}
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="pband prun" id="run">
          <div className="phead">
            <h2>All You Need Is Docker</h2>
            <p>Set a database password and an encryption key, then start me. Whoever makes the first account owns the place.</p>
          </div>
          <div className="pcmds">
            <Copy text="cp .env.example .env" />
            <Copy text="docker compose up -d" />
          </div>
          <p className="psmall">
            The <Link to="/docs/self-hosting/install">install guide</Link> covers HTTPS, your own Postgres and backups.
          </p>
        </section>
      </main>
    </Layout>
  );
}
