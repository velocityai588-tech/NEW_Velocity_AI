import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Calendar, Users, BarChart3, Zap } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const features = [
  {
    name: 'AI-Driven Scheduling',
    description: 'Automatically builds and optimizes schedules based on real demand, availability, and business priorities — reducing manual effort and costly inefficiencies.',
    icon: Calendar,
  },
  {
    name: 'Intelligent Redeployment',
    description: 'Identifies unused or freed capacity and recommends where employees can be redeployed for maximum impact across your organization.',
    icon: Users,
  },
  {
    name: 'Workforce Intelligence',
    description: 'Turns operational data into clear, actionable insights so leaders understand how work is performed and where productivity can be improved.',
    icon: BarChart3,
  },
  {
    name: 'Operational Automation',
    description: 'Replaces repetitive workforce planning tasks with AI, removing friction from day-to-day operations and freeing up valuable time.',
    icon: Zap,
  },
];

export function LandingFeatures() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useGSAP(() => {
    cardRefs.current.forEach((card, i) => {
      if (!card) return;
      gsap.fromTo(
        card,
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          delay: i * 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: card,
            start: 'top 88%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    });
  }, { scope: containerRef });

  return (
    <div ref={containerRef} id="how-it-works" className="py-24 sm:py-32 relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#2DD4BF]/20 bg-[#2DD4BF]/5 text-[#0F766E] text-xs font-medium mb-4 tracking-wide uppercase">
            CAPABILITIES
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            What Velocity AI{' '}
            <span className="italic font-serif text-[#0F766E]">Actually Does</span>
          </h2>
          <p className="mt-4 text-lg text-slate-500 leading-relaxed">
            Powerful AI capabilities that transform how you manage your workforce,
            eliminating guesswork and driving real ROI.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.name}
                ref={el => { cardRefs.current[i] = el; }}
                className="group relative bg-white rounded-2xl p-8 border border-stone-200/80 shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-[#2DD4BF]/30 transition-all duration-300"
              >
                {/* Teal glow on hover */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#2DD4BF]/0 to-[#2DD4BF]/0 group-hover:from-[#2DD4BF]/3 group-hover:to-transparent transition-all duration-300" />

                {/* Icon — consistent teal */}
                <div className="w-10 h-10 rounded-xl bg-[#F0FDFA] border border-[#CCFBF1] flex items-center justify-center mb-5 group-hover:bg-[#CCFBF1] group-hover:shadow-[0_0_12px_rgba(45,212,191,0.2)] transition-all duration-300">
                  <Icon className="w-5 h-5 text-[#0F766E]" strokeWidth={1.75} />
                </div>

                <h3 className="text-base font-semibold text-slate-900 mb-2 tracking-tight">
                  {feature.name}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
