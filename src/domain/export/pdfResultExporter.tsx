import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { ResultExporter, ExportableTeam } from './resultExporter';
import type { Session } from '../session';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11, fontFamily: 'Helvetica', color: '#2B2B2B' },
  header: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#CCCCCC', paddingBottom: 10 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#3B6EA5', marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#666666' },
  teamBlock: { marginBottom: 16, padding: 10, backgroundColor: '#F8F9FA', borderRadius: 4 },
  teamTitle: { fontSize: 13, marginBottom: 6, fontWeight: 'bold', color: '#3B6EA5' },
  memberRow: { marginLeft: 8, marginBottom: 3, fontSize: 11 },
  scoreText: { fontSize: 10, color: '#555555', marginTop: 4, fontStyle: 'italic' },
});

export class PdfResultExporter implements ResultExporter {
  async export(
    session: Session,
    teams: ExportableTeam[]
  ): Promise<Blob> {
    const doc = (
      <Document>
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.title}>Fair Team Matcher — Results</Text>
            <Text style={styles.subtitle}>
              Session Mode: {session.mode.toUpperCase()} | Created: {new Date(session.createdAt).toLocaleDateString()} | Teams Formed: {teams.length}
            </Text>
          </View>
          {teams.map((team) => (
            <View style={styles.teamBlock} key={team.teamNumber}>
              <Text style={styles.teamTitle}>
                Team {team.teamNumber} — Fairness Score: {team.fairnessScore.toFixed(2)}
              </Text>
              {team.members.map((m) => (
                <Text key={m.id} style={styles.memberRow}>
                  • {m.name ?? m.rollNumber ?? m.id}
                </Text>
              ))}
              <Text style={styles.scoreText}>
                Mutual Picks: {team.scoreBreakdown.mutualPickCount} | Avg Similarity: {team.scoreBreakdown.avgQuestionSimilarity.toFixed(1)}/10
                {team.scoreBreakdown.avoidPenaltyApplied ? ' | Avoid penalty applied' : ''}
              </Text>
            </View>
          ))}
        </Page>
      </Document>
    );
    return pdf(doc).toBlob();
  }
}
