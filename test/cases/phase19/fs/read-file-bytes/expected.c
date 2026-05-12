#include "runtime.h"
#include "std/fs.h"

typedef struct {
    int32_t _state; int _result; bool _done;
    Array_u8 data;
    TscFsReadBytesAwaitable _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_fs_read_bytes_async(STR_LIT("./data.bin"));
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_fs_read_bytes_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->data = self->_await_0._result;
            printf("%zu\n", self->data.length);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
