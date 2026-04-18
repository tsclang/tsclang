#include "runtime.h"

typedef struct {
    int32_t _state;
    String _result;
    bool _done;
    String url;
    String result;
} fetch_state;

int main(void) {
    TSC_INIT();
    return 0;
}
