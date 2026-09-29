import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { supabase } from '../../infrastructure/supabase/supabaseClient';
import type { SessionMode } from '../../domain/session';

interface ParticipantEntry {
  id: string;
  name?: string;
  rollNumber?: string;
}

export const CreateSessionPage: React.FC = () => {
  const [mode, setMode] = useState<SessionMode>('friend');
  const [teamSize, setTeamSize] = useState<number>(3);
  const [participants, setParticipants] = useState<ParticipantEntry[]>([]);

  // Friend Mode input
  const [friendName, setFriendName] = useState('');

  // Class Mode fast-entry fields
  const [batch, setBatch] = useState('24');
  const [campus, setCampus] = useState<'F' | 'L' | 'I'>('F');
  const [rollDigits, setRollDigits] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const navigate = useNavigate();

  const handleModeChange = (newMode: SessionMode) => {
    setMode(newMode);
    if (newMode === 'friend') {
      setTeamSize(3); // fixed for Friend Mode
    }
    setParticipants([]);
    setValidationError(null);
  };

  const handleAddFriend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = friendName.trim();
    if (!trimmed) return;

    if (participants.some((p) => p.name?.toLowerCase() === trimmed.toLowerCase())) {
      setValidationError(`Participant "${trimmed}" is already added.`);
      return;
    }

    setParticipants((prev) => [...prev, { id: crypto.randomUUID(), name: trimmed }]);
    setFriendName('');
    setValidationError(null);
  };

  const handleAddClassRoll = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedRoll = rollDigits.trim();
    // Validate: Roll digits must be exactly 4 numeric characters (AUTH-8)
    if (!/^\d{4}$/.test(trimmedRoll)) {
      setValidationError('Roll number must be exactly 4 digits (e.g. 3053).');
      return;
    }

    const fullRoll = `${batch}${campus}-${trimmedRoll}`;

    if (participants.some((p) => p.rollNumber === fullRoll)) {
      setValidationError(`Roll number ${fullRoll} is already in the list.`);
      return;
    }

    // Append to running list, clear only rollDigits while keeping Batch and Campus (AUTH-7)
    setParticipants((prev) => [...prev, { id: crypto.randomUUID(), rollNumber: fullRoll }]);
    setRollDigits('');
  };

  const handleRemove = (id: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const startEdit = (p: ParticipantEntry) => {
    setEditingId(p.id);
    setEditValue(p.name ?? p.rollNumber ?? '');
  };

  const saveEdit = (id: string) => {
    const trimmed = editValue.trim();
    if (!trimmed) return;

    setParticipants((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        return mode === 'friend' ? { ...p, name: trimmed } : { ...p, rollNumber: trimmed };
      })
    );
    setEditingId(null);
  };

  const handleCreateSession = async () => {
    if (participants.length < teamSize) {
      setValidationError(`Please add at least ${teamSize} participants.`);
      return;
    }

    setSubmitting(true);
    setValidationError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const createdBy = user ? user.id : 'env-organizer-id';

      // 1. Create Session
      const { data: sessionData, error: sessionErr } = await supabase
        .from('sessions')
        .insert({
          mode,
          team_size: teamSize,
          status: 'open', // opened so link is ready
          created_by: createdBy,
        })
        .select()
        .single();

      if (sessionErr || !sessionData) {
        throw new Error(sessionErr?.message || 'Failed to create session');
      }

      // 2. Insert Participants
      const participantRows = participants.map((p) => ({
        session_id: sessionData.id,
        name: p.name ?? null,
        roll_number: p.rollNumber ?? null,
        has_submitted: false,
      }));

      const { error: pErr } = await supabase.from('participants').insert(participantRows);
      if (pErr) throw pErr;

      navigate(`/session/${sessionData.id}/monitor`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setValidationError(`Creation failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
      <Navbar mode={mode} />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#3B6EA5] dark:text-[#699DD8] mb-1">
            Create Team Matching Session
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configure session mode, team size, and pre-register participants.
          </p>
        </div>

        {validationError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {validationError}
          </div>
        )}

        <div className="bg-white dark:bg-[#252525] p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-6">
          {/* Mode Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Select Mode (Permanent for this session)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleModeChange('friend')}
                className={`p-4 rounded-xl border text-left transition ${
                  mode === 'friend'
                    ? 'border-[#3B6EA5] bg-[#EAF2FF] dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-semibold'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="text-sm font-bold flex items-center gap-1.5 mb-1">
                  <span>👥</span> Friend Mode
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                  Fixed team size 3. Dropdown identity, private teammate ranking & avoid list.
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('class')}
                className={`p-4 rounded-xl border text-left transition ${
                  mode === 'class'
                    ? 'border-amber-600 bg-[#FFFDF5] dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-semibold'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="text-sm font-bold flex items-center gap-1.5 mb-1">
                  <span>🎓</span> Class Mode
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                  Custom team size. Fast roll number entry + Google sign-in validation.
                </div>
              </button>
            </div>
          </div>

          {/* Team Size */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
              Target Team Size
            </label>
            {mode === 'friend' ? (
              <div className="text-sm text-gray-600 dark:text-gray-300 py-1 font-medium">
                Fixed at 3 members (Friend Mode rule: remainder forms one smaller team of 2).
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="2"
                  max="15"
                  value={teamSize}
                  onChange={(e) => setTeamSize(Math.max(2, parseInt(e.target.value) || 2))}
                  className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent text-sm font-medium focus:ring-2 focus:ring-[#3B6EA5]"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  participants per team (supports up to 50 students total)
                </span>
              </div>
            )}
          </div>

          {/* Participant Entry */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Add Participants ({participants.length} added)
            </label>

            {mode === 'friend' ? (
              <form onSubmit={handleAddFriend} className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="Enter friend's full name"
                  value={friendName}
                  onChange={(e) => setFriendName(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent text-sm focus:ring-2 focus:ring-[#3B6EA5]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#3B6EA5] hover:bg-[#2F5986] text-white text-sm font-medium rounded-lg"
                >
                  Add
                </button>
              </form>
            ) : (
              /* Class Mode Fast Roll Number Entry (AUTH-7) */
              <form onSubmit={handleAddClassRoll} className="space-y-2 mb-4 p-4 bg-gray-50 dark:bg-[#1E1E1E] rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  Fast Roll-Number Entry — Batch & Campus stay filled across entries:
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20">
                    <label className="block text-[10px] uppercase font-bold text-gray-500">Batch</label>
                    <input
                      type="text"
                      maxLength={2}
                      value={batch}
                      onChange={(e) => setBatch(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-[#252525] text-sm font-mono text-center"
                    />
                  </div>

                  <div className="w-24">
                    <label className="block text-[10px] uppercase font-bold text-gray-500">Campus</label>
                    <select
                      value={campus}
                      onChange={(e) => setCampus(e.target.value as any)}
                      className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-[#252525] text-sm font-mono"
                    >
                      <option value="F">F (Chiniot)</option>
                      <option value="L">L (Lahore)</option>
                      <option value="I">I (Islamabad)</option>
                    </select>
                  </div>

                  <span className="text-gray-400 font-mono mt-4">-</span>

                  <div className="flex-1">
                    <label className="block text-[10px] uppercase font-bold text-gray-500">Roll (4 Digits)</label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="e.g. 3053"
                      value={rollDigits}
                      onChange={(e) => setRollDigits(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-[#252525] text-sm font-mono focus:ring-2 focus:ring-[#3B6EA5]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="mt-4 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded transition"
                  >
                    Add [Enter]
                  </button>
                </div>
              </form>
            )}

            {/* Running List with Edit / Remove */}
            <div className="max-h-56 overflow-y-auto space-y-1.5 border border-gray-200 dark:border-gray-800 rounded-lg p-2 bg-gray-50/50 dark:bg-black/20">
              {participants.length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-400">
                  No participants added yet.
                </div>
              ) : (
                participants.map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-[#252525] rounded-md border border-gray-200 dark:border-gray-700 text-xs"
                  >
                    {editingId === p.id ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="px-2 py-1 border rounded bg-transparent w-full"
                        />
                        <button
                          onClick={() => saveEdit(p.id)}
                          className="text-xs text-green-600 font-semibold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium">
                        {idx + 1}. {p.name ?? p.rollNumber}
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      {editingId !== p.id && (
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                          ✏️
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemove(p.id)}
                        className="text-red-500 hover:text-red-700 text-sm font-bold"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreateSession}
            disabled={submitting || participants.length === 0}
            className="w-full py-3 bg-[#3B6EA5] hover:bg-[#2F5986] text-white font-medium rounded-lg transition disabled:opacity-50 text-sm shadow-sm"
          >
            {submitting ? 'Creating Session...' : 'Create & Open Session'}
          </button>
        </div>
      </main>

      <Footer />
    </div>
  );
};
