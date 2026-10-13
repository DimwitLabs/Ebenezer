import Head from "@docusaurus/Head";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";

import { Copy, Ghost, Icon, Pic } from "../components/Landing";

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
    shots: ["today-past"],
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
    shots: ["money-sits", "against-index"],
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
    shots: ["today-future"],
  },
] as const;

const DAILY = [
  { title: "My Note", text: "What changed, what is carrying you, what is not.", shot: "note-phone" },
  { title: "Signal Or Humbug", text: "Every story about what you hold, judged in one line.", shot: "news-phone" },
  { title: "Ask Me", text: "Answers from your own books, and what to ask next.", shot: "ask-phone" },
];

const SPEND = [
  { title: "Say It", text: "“₹450 on lunch” is enough. I do the filing.", shot: "spend-chat-phone" },
  { title: "Habits", text: "Which small spends add up, and which big ones are rare.", shot: "trends-phone" },
  { title: "Cards", text: "Every statement, every due date, and what is billed.", shot: "cards-phone" },
];

const MORE = [
  ["payments", "No Data Bill", "Exchange and AMFI prices, free every evening."],
  ["monitor_heart", "I Watch My Sources", "Two failures in a row and you hear from me."],
  ["mail", "A Morning Report", "Net worth, my note and the news, by mail."],
  ["tune", "To Your Taste", "Pick my personality and tone, or write your own."],
  ["group", "For The Family", "Share a portfolio with the people you keep books with."],
  ["key", "Keys Kept Locked", "AI, mail and alert passwords encrypted at rest."],
];

function Tiles({ items }: { items: { title: string; text: string; shot: string }[] }) {
  return (
    <div className="ptiles swipe">
      {items.map((t) => (
        <div key={t.title} className="ptile">
          <b>{t.title}</b>
          <p>{t.text}</p>
          <div className="pimg">
            <Pic name={t.shot} alt={t.title} phone={false} />
          </div>
        </div>
      ))}
    </div>
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
          <figure className="pshot wide">
            <Pic name="today" alt="Today: net worth, what it is made of, and my note." eager phone={false} />
          </figure>
          <figure className="pshot narrow">
            <Pic name="today-phone" alt="Today on a phone." phone={false} />
          </figure>
        </section>

        <section className="verdict">
          <span className="vkick">Plainly</span>
          <p>
            Your money earned <b className="up">9.4%</b> a year. The same rupees in the Nifty 50 earned <b className="down">13.8%</b>.
          </p>
          <small>Every dated rupee counted, against the same money on the same days. Usually the index wins. I will say so.</small>
        </section>

        <section className="pname">
          <span className="vkick">About The Name</span>
          <p>
            Ebenezer Scrooge kept the books, counted every coin, and thought most of what people spent money on was humbug. Then three ghosts kept him up all night, showing him his past, his present
            and his likely future. He came out of it better with his money and with his people.
          </p>
          <p className="punch">I have kept the ledger and the ghosts. The miserliness I now practise on your behalf.</p>
        </section>

        <div className="phead">
          <span className="ghosts">
            <Ghost when="past" />
            <Ghost when="present" />
            <Ghost when="future" />
          </span>
          <h2>Past, Present And Future</h2>
          <p>My three ghosts, put to work on your money.</p>
        </div>
        <div className="acts swipe">
          {ACTS.map((a, i) => (
            <section key={a.when} className={`act act-${a.when}${i % 2 ? " flip" : ""}`}>
              <div className="acopy">
                <span className="aghost">
                  <Ghost when={a.when} />
                  {a.ghost}
                </span>
                <h2>{a.title}</h2>
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
              <figure className="ashot">
                {a.shots.map((shot) => (
                  <Pic key={shot} name={shot} alt={a.title} />
                ))}
              </figure>
            </section>
          ))}
        </div>

        <section className="pband">
          <div className="phead">
            <h2>Every Morning, A Word</h2>
            <p>I read the news before you wake, and I answer what you ask from your own books.</p>
          </div>
          <Tiles items={DAILY} />
        </section>

        <section className="pband">
          <div className="phead">
            <h2>And Your Spending</h2>
            <p>A side job, kept properly.</p>
          </div>
          <Tiles items={SPEND} />
        </section>

        <section className="pband">
          <div className="phead">
            <h2>…More?</h2>
          </div>
          <div className="pmore swipe">
            {MORE.map(([icon, title, text]) => (
              <div key={title}>
                <span className="item-i ms">{icon}</span>
                <b>{title}</b>
                <p>{text}</p>
              </div>
            ))}
          </div>
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
