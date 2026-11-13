import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProvider } from '../context/AppContext';
import { LocalAuthRepository, LocalQuizRepository } from '../repositories/localStorageRepositories';
import { DashboardPage } from './DashboardPage';

describe('Bolt 04: DashboardPage', () => {
  it('lists quizzes for logged-in user, uploads a new CSV quiz, and deletes a quiz', async () => {
    const user = userEvent.setup();
    const authRepo = new LocalAuthRepository();
    const quizRepo = new LocalQuizRepository();
    const currentUser = await authRepo.signUp('learner@example.com', 'password123');
    await quizRepo.create(currentUser.id, {
      title: '既存問題集',
      questions: [
        {
          question: '1+1は？',
          choice1: '2',
          choice2: '3',
          choice3: null,
          choice4: null,
          answer: 1,
          explanation: null,
        },
      ],
    });

    render(
      <AppProvider authRepository={authRepo} quizRepository={quizRepo}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/quiz/:quizId" element={<div>Quiz Play Screen</div>} />
            <Route path="/login" element={<div>Login Screen</div>} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    expect(await screen.findByText('既存問題集')).toBeInTheDocument();
    expect(screen.getByText('1問')).toBeInTheDocument();

    // Open upload modal and add a quiz
    await user.click(screen.getByRole('button', { name: /新規CSVアップロード/ }));
    const csv = 'question,choice1,choice2,choice3,choice4,answer,explanation\nQ,A,B,,,2,Bです';
    const file = new File([csv], '新規クイズ.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('CSVファイルを選択'), file);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('新規クイズ')).toBeInTheDocument();

    // Delete existing quiz (with confirm button)
    const deleteButtons = screen.getAllByRole('button', { name: '削除' });
    await user.click(deleteButtons[1]); // 既存問題集 (older)
    await user.click(screen.getByRole('button', { name: '削除を確定' }));

    await waitFor(() => {
      expect(screen.queryByText('既存問題集')).not.toBeInTheDocument();
    });
    expect(screen.getByText('新規クイズ')).toBeInTheDocument();
  });
});
