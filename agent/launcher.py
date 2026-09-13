from cadgpt_agent.main import main
if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as error:
        print("CADGPT: " + str(error))
        try:
            import tkinter as tk
            from tkinter.messagebox import showerror
            window = tk.Tk()
            window.withdraw()
            showerror("CADGPT could not connect", str(error))
            window.destroy()
        except Exception:
            pass
        try:
            input("Press Enter to close.")
        except EOFError:
            pass
        raise SystemExit(1)
