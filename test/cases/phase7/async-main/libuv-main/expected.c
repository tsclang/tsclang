#define TSC_SCHEDULER_LIBUV
#include "runtime.h"

typedef struct { int32_t _state; bool _done; } main_state;

static void main_poll(main_state *self) {
    switch (self->_state) {
        case 0:
            printf("hello libuv\n");
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    main_state _main_sm = {0};
    TSC_RUN_ASYNC(main_state, main_poll, &_main_sm);
    return 0;
}
