#include "runtime.h"
#include "std/fs.h"

typedef struct { int32_t _state; int _result; bool _done; TscFsVoidAwaitable _await_0; } run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_fs_write_async(STR_LIT("./out.txt"), STR_LIT("hello"));
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_fs_write_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
