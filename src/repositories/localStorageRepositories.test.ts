import { beforeEach, describe, expect, it } from 'vitest';
import {
  LocalAuthRepository,
  LocalQuizRepository,
} from './localStorageRepositories';

describe('Bolt 03: localStorageRepositories', () => {
  let authRepo: LocalAuthRepository;
  let quizRepo: LocalQuizRepository;

  beforeEach(() => {
    localStorage.clear();
    authRepo = new LocalAuthRepository();
    quizRepo = new LocalQuizRepository();
  });

  describe('LocalAuthRepository', () => {
    it('signs up, maintains session, signs out, and signs back in', async () => {
      expect(await authRepo.getCurrentUser()).toBeNull();

      const created = await authRepo.signUp('User@Example.com', 'secret123');
      expect(created.email).toBe('user@example.com');
      expect((await authRepo.getCurrentUser())?.id).toBe(created.id);

      await authRepo.signOut();
      expect(await authRepo.getCurrentUser()).toBeNull();

      const loggedIn = await authRepo.signIn('user@example.com', 'secret123');
      expect(loggedIn.id).toBe(created.id);
    });

    it('rejects invalid email, short password, duplicate email, and wrong credentials', async () => {
      await expect(authRepo.signUp('not-an-email', 'secret123')).rejects.toThrow();
      await expect(authRepo.signUp('a@example.com', '12345')).rejects.toThrow();

      await authRepo.signUp('a@example.com', 'secret123');
      await expect(authRepo.signUp('A@example.com', 'another123')).rejects.toThrow();

      await authRepo.signOut();
      await expect(authRepo.signIn('a@example.com', 'wrongpass')).rejects.toThrow();
      await expect(authRepo.signIn('nobody@example.com', 'secret123')).rejects.toThrow();
    });
  });

  describe('LocalQuizRepository & User Isolation', () => {
    it('creates, lists, fetches, and deletes quizzes strictly isolated per user', async () => {
      const userA = await authRepo.signUp('a@example.com', 'password123');
      const userB = await authRepo.signUp('b@example.com', 'password123');

      const quizA = await quizRepo.create(userA.id, {
        title: 'AWS 基礎',
        questions: [
          {
            question: 'S3とは？',
            choice1: 'オブジェクトストレージ',
            choice2: 'リレーショナルDB',
            choice3: null,
            choice4: null,
            answer: 1,
            explanation: 'Simple Storage Serviceです。',
          },
        ],
      });

      const quizB = await quizRepo.create(userB.id, {
        title: '基本情報',
        questions: [
          {
            question: 'CPUの略は？',
            choice1: 'Central Processing Unit',
            choice2: 'Control Power Unit',
            choice3: null,
            choice4: null,
            answer: 1,
            explanation: null,
          },
        ],
      });

      // User A sees only Quiz A
      const listA = await quizRepo.listByUser(userA.id);
      expect(listA).toHaveLength(1);
      expect(listA[0].id).toBe(quizA.id);

      // User B cannot fetch or delete Quiz A
      expect(await quizRepo.getById(quizA.id, userB.id)).toBeNull();
      expect(await quizRepo.delete(quizA.id, userB.id)).toBe(false);
      expect(await quizRepo.getById(quizA.id, userA.id)).not.toBeNull();

      // Owner User A can delete Quiz A, while Quiz B remains untouched
      expect(await quizRepo.delete(quizA.id, userA.id)).toBe(true);
      expect(await quizRepo.listByUser(userA.id)).toEqual([]);
      expect(await quizRepo.listByUser(userB.id)).toHaveLength(1);
      expect(await quizRepo.getById(quizB.id, userB.id)).not.toBeNull();
    });

    it('rejects creating a quiz with blank title or no questions', async () => {
      const user = await authRepo.signUp('c@example.com', 'password123');
      await expect(
        quizRepo.create(user.id, { title: '   ', questions: [] }),
      ).rejects.toThrow();
    });
  });
});
