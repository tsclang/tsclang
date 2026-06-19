#include "runtime.h"
#include "std/fs.h"

typedef struct {
    int32_t _state; int _result; bool _done;
    TscDirEntryArray entries;
    TscFsReaddirAwaitable _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_fs_readdir_async(STR_LIT("."));
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_fs_readdir_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->entries = self->_await_0._result;
            printf("%zu\n", self->entries.length);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
