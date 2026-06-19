#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } doContinue_state;

static void doContinue_poll(doContinue_state *self) {
    switch (self->_state) {
        case 0:
            int32_t total = 0;
            int32_t i = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            i = i + 1;
            if (fmod(i, 2) == 0) goto dowhile_1_cont;
            total = (int32_t)((uint32_t)total + (uint32_t)i);
dowhile_1_cont:
            if (i < 5) {
                self->_state = 1;
                goto case_1;
            }
dowhile_1_end:
            self->_result = total;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
