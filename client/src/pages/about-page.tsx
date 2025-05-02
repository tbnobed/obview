import { Link } from "wouter";
import PageLayout from "@/components/layout/page-layout";

export default function AboutPage() {
  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="prose lg:prose-xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">About Obviu.io</h1>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
            <p>
              Obviu.io was created to simplify the collaborative media review process for creative teams. 
              We believe that effective feedback should be intuitive, contextual, and seamlessly integrated 
              with your workflow.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">What We Do</h2>
            <p>
              Obviu.io provides a powerful platform for media review, collaborative feedback, and project management.
              Our features include:
            </p>
            <ul>
              <li>Timeline-based commenting for precise feedback</li>
              <li>Version control and comparison</li>
              <li>Team collaboration with customizable permissions</li>
              <li>Secure sharing with external reviewers</li>
              <li>Self-hosted deployment options</li>
            </ul>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Our Team</h2>
            <p>
              Obviu.io is developed by a dedicated team of professionals with backgrounds in media production,
              software development, and UX design. Our combined experience helps us create tools that truly 
              enhance creative workflows.
            </p>
          </section>
          
          <section className="text-center mt-12">
            <Link href="/">
              <button className="bg-primary-500 hover:bg-primary-600 text-white font-semibold py-2 px-6 rounded-md transition-colors">
                Back to Home
              </button>
            </Link>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}