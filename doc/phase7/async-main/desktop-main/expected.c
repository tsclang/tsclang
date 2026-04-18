#include "runtime.h"

typedef struct { int32_t _state; bool _done; } main_state;

static void main_poll(main_state *self) {
    switch (self->_state) {
        case 0:
            printf("hello async\n");
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    tsc_event_loop_run(main_poll);
    return 0;
}
