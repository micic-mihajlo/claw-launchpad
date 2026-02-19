import { motion } from "framer-motion";
import type { PropsWithChildren } from "react";

type LandingSectionProps = {
  id?: string;
  eyebrow: string;
  title: string;
  lead: string;
};

export function LandingSection(props: PropsWithChildren<LandingSectionProps>) {
  return (
    <section className="landingShell landingSection" id={props.id}>
      <motion.div
        className="landingSectionHeader"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.18 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <p className="landingSectionEyebrow">{props.eyebrow}</p>
        <h2>{props.title}</h2>
        <p className="landingSectionLead">{props.lead}</p>
      </motion.div>
      {props.children}
    </section>
  );
}
